// For usage in https://jshint.com/
/* jshint esversion: 8 */
document.addEventListener("DOMContentLoaded", function() {
    const DEBUG_MODE = true;
    const DATA_FILE = "data/wikifaces-datacache.csv";
    const MAX_ROUNDS = 2; // Configurable number of rounds = number of circles in the scoreboard
    const MAX_CHARACTERS = 250; // Maximum characters to show in Wikipedia extract, fetched from API

    // === Global Timeout Configurations - in milliseconds ===
    const BUTTON_SHOW_DELAY = 500; // Interval between showing the portrait and showing the name buttons
    const IMAGE_LOADING_MESSAGE_DELAY = 5000; // Max wait time before "loadingNotice.textContent = "⏳ Hold on, image still loading...";" is shown
    const IMAGE_ERROR_DISPLAY_DURATION = 10000; // How long the image loading error message is shown (ms)

    const SWIPE_THRESHOLD = 100; // Minimum swipe distance to trigger next round

    // When the result banner is shown (✅ or ❌), this defines how long interaction is locked afterward to prevent double-pressing or skipping too quickly.
    const NEXT_ROUND_LOCK = 1000; // Lock interaction after showing result banner and overlay (ms) - user can't click too quickly and progress to next round

    // Need to better understand the following constants
    const GAME_END_DISPLAY_DELAY = 1600; // Delay before showing win/loss GIF (ms)
    const GAME_END_COUNTDOWN_START = 5; // Countdown seconds after game ends and new game begin
    const GAME_END_INTERVAL_DELAY = 1000; // Countdown tick interval (ms)

    const NAME_SELECTION_TIMEOUT = 1000; // 1 seconds, if it takes longer to select name pair, show a message

    let portraits = [];
    let correctPerson = null;
    let incorrectPerson = null;
    let score = {
        correct: 0,
        wrong: 0
    };
    let roundPlayed = false;
    let usedNameKeys = new Set();
    let usedPairs = new Set();

    const scoreBoard = document.getElementById("score-board");
    const resultBanner = document.getElementById("result-banner");
    const portraitElement = document.getElementById("portrait");
    const nameOptions = document.getElementById("buttons");
    const wikiInfo = document.getElementById("wiki-info");

    /**
     * Capitalizes the first letter of a given text string.
     * @param {string} text - Input string.
     * @returns {string} Text with first letter capitalized.
     */
    function capitalizeFirstLetter(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    /**
     * Parses CSV text into an array of person objects.
     * Assumes the CSV format is: namekey;image;depicts;name;description;wikipedia
     * Each line must have at least 6 semicolon-separated fields.
     * @param {string} text - CSV text content.
     * @returns {Array<Object>} Parsed entries with structured fields.
     */
    function parseCSV(text) {
        try {
            if (!text || typeof text !== "string") {
                console.warn("Invalid or empty CSV text input.");
                return [];
            }

            const lines = text.trim().split("\n");
            if (lines.length < 2) {
                console.warn("CSV appears to contain no data rows.");
                return [];
            }

            return lines
                .slice(1) // Skip header
                .map((line, index) => {
                    const parts = line.split(";").map((part) => part.trim());

                    if (parts.length < 6) {
                        console.warn(`Skipping malformed row ${index + 2}: not enough fields`, line);
                        return null;
                    }

                    return {
                        namekey: parts[0],
                        image: parts[1],
                        depicts: parts[2],
                        name: parts[3],
                        description: capitalizeFirstLetter(parts[4]),
                        wikipedia: parts[5],
                    };
                })
                .filter((entry) => entry !== null);
        }
        catch (error) {
            console.error("Error parsing CSV:", error);
            return [];
        }
    }



    //******** Image loading stuff starts here

    /**
     * Loads a portrait image with fallback and timeout logic, then shows it.
     * @param {string} src - Image source URL.
     * @param {function} onComplete - Callback to run after image is shown.
     */
    function handlePortraitLoadAndDisplay(src, onComplete) {
        const spinner = document.getElementById("portrait-spinner");
        if (spinner) spinner.style.display = "block";

        loadPortraitImage(src, () => {
            if (spinner) spinner.style.display = "none";
            displayLoadedPortrait(onComplete);
        });
    }

    /**
     * Loads image and handles timeout and errors.
     * @param {string} src - Image source URL.
     * @param {function} onLoad - Callback when loaded.
     */
    function loadPortraitImage(src, onLoad) {
        const img = new Image();
        img.src = src;

        const timeout = setTimeout(() => {
            console.warn("Image load timeout");
            showImageLoadingNotice();
        }, IMAGE_LOADING_MESSAGE_DELAY);

        img.onload = () => {
            clearTimeout(timeout);
            removeImageLoadingNotice();
            onLoad();
        };

        img.onerror = () => {
            clearTimeout(timeout);
            console.error("Image failed to load:", src);
            showImageLoadError();
        };
    }

    /**
     * Displays the loaded image with fade-in, then shows name buttons.
     * @param {function} callback - Called after image is shown.
     */
    function displayLoadedPortrait(callback) {
        portraitElement.style.backgroundImage = `url(${correctPerson.image})`;
        setTimeout(() => {
            if (typeof callback === 'function') callback();
        }, BUTTON_SHOW_DELAY);
    }

    /**
     * Shows a message to indicate image is still loading.
     */
    function showImageLoadingNotice() {
        const loadingNotice = document.createElement("div");
        loadingNotice.id = "portrait-loading-notice";
        loadingNotice.className = "portrait-loading-notice";
        loadingNotice.textContent = "⏳ Hold on, image still loading...";
        document.body.appendChild(loadingNotice);
    }

    /**
     * Removes the image loading notice.
     */
    function removeImageLoadingNotice() {
        const notice = document.getElementById("portrait-loading-notice");
        if (notice && notice.parentElement) {
            notice.parentElement.removeChild(notice);
        }
    }

    /**
     * Displays a visible error message on the screen if image fails to load.
     */
    function showImageLoadError(duration = IMAGE_ERROR_DISPLAY_DURATION) {
        const errorMessage = document.createElement("div");
        errorMessage.textContent = "⚠️ Failed to load image. Please try again.";
        errorMessage.className = "portrait-load-error"; // 🔧 fixed: no leading dot here!
        document.body.appendChild(errorMessage);

        setTimeout(() => {
            if (errorMessage.parentElement) {
                errorMessage.parentElement.removeChild(errorMessage);
            }
        }, duration);
    }

    //******** Image loading stuff ends here

    // ==== Start of button related stuff


    function showNameSelectionNotice() {
        const notice = document.createElement("div");
        notice.id = "name-selection-notice";
        notice.className = "name-selection-notice";
        notice.textContent = "⏳ Please wait, selecting two random persons...";
        document.body.appendChild(notice);
    }

    function removeNameSelectionNotice() {
        const notice = document.getElementById("name-selection-notice");
        if (notice && notice.parentElement) {
            notice.parentElement.removeChild(notice);
        }
    }

    /**
     * Randomly shuffles the order of two names.
     * Ensures the correct name doesn't always appear first.
     * @param {string} name1
     * @param {string} name2
     * @returns {Array<string>} - A shuffled pair
     */
    function randomShuffleTwoNames(name1, name2) {
        return Math.random() < 0.5 ? [name1, name2] : [name2, name1];
    }

/**
 * Logs all used person pairs by name, not just by their Wikidata URLs.
 */
function logUsedNamePairs() {
    console.log("Used name pairs:");
    Array.from(usedPairs).forEach(key => {
        const [id1, id2] = key.split("|");
        const person1 = portraits.find(p => p.depicts === id1);
        const person2 = portraits.find(p => p.depicts === id2);
        if (person1 && person2) {
            console.log(`- ${person1.name} (${person1.depicts}) ↔ ${person2.name} (${person2.depicts})`);
        }
    });
}


    /**
     * Selects a unique pair of people (not shown before in the round) from the name group.
     * @param {Array} nameGroup - List of people with the same name key.
     * @returns {[Object, Object]} A pair of distinct people.
     */
    function selectUniquePairFrom(nameGroup) {
        let pair, pairKey;
        do {
            pair = getTwoDistinctPeople(nameGroup);
            pairKey = [pair[0].depicts, pair[1].depicts].sort().join("|");
        } while (usedPairs.has(pairKey));
        usedPairs.add(pairKey);
        return pair;
    }

    /**
     * Returns two distinct randomly selected people from a group.
     * @param {Array} group - People with the same name.
     */
    function getTwoDistinctPeople(group) {
        if (group.length < 2) return [null, null];

        let firstIndex = Math.floor(Math.random() * group.length);
        let secondIndex;
        do {
            secondIndex = Math.floor(Math.random() * group.length);
        } while (secondIndex === firstIndex);

        return [group[firstIndex], group[secondIndex]];
    }


/**
 * Creates and displays name selection buttons inside the pre-defined .button-wrapper container.
 * Adds click listeners to each button and includes an "OR" divider between two names.
 *
 * @param {Array} namesPair - An array containing exactly two names to be displayed.
 */
function createNameButtons(namesPair) {
    try {

    if (!Array.isArray(namesPair) || namesPair.length !== 2) {
        console.error("createNameButtons expects exactly 2 names:", namesPair);
        return;
    }

    clearNameButtons(); // Clear existing buttons

    // First button
    const firstButton = document.createElement("name-button");
    firstButton.textContent = namesPair[0];
    firstButton.classList.add("name-button");
    firstButton.disabled = false;
    firstButton.addEventListener("click", handleRoundResult);
    nameOptions.appendChild(firstButton);

    // "OR" divider
    const orDivider = document.createElement("div");
    orDivider.textContent = "OR";
    orDivider.classList.add("or-divider");
    nameOptions.appendChild(orDivider);

    // Second button
    const secondButton = document.createElement("name-button");
    secondButton.textContent = namesPair[1];
    secondButton.classList.add("name-button");
    secondButton.disabled = false;
    secondButton.addEventListener("click", handleRoundResult);
    nameOptions.appendChild(secondButton);

    } catch (error) {
        console.error("Failed to create name buttons:", error);
    }
}

/**
 * Shows the name buttons with a timeout message if it takes too long.
 * @returns {Promise<Array>} Resolves with shuffled name pair
 */
/**
 * Selects and prepares names with a fallback timeout message.
 * Allows nameKeys to be reused across rounds as long as the person-pair is unique.
 * @returns {Promise<Array>} - Resolves with shuffled names.
 */
function showNameButtonsWithTimeout() {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            showNameSelectionNotice();
        }, NAME_SELECTION_TIMEOUT);

        const uniqueNameKeys = [...new Set(portraits.map(p => p.namekey))];
        let selectedNameKey = null;
        let nameGroup = [];
        let attempts = 0;

        while (attempts < 100) {
            const candidateKey = uniqueNameKeys[Math.floor(Math.random() * uniqueNameKeys.length)];
            const candidateGroup = portraits.filter(p => p.namekey === candidateKey);

            if (candidateGroup.length >= 2) {
                const testPair = selectUniquePairFrom(candidateGroup);
                if (testPair[0] && testPair[1]) {
                    selectedNameKey = candidateKey;
                    nameGroup = candidateGroup;
                    [correctPerson, incorrectPerson] = testPair;
                    break;
                }
            }
            attempts++;
        }

        clearTimeout(timeout);
        removeNameSelectionNotice();

        if (!correctPerson || !incorrectPerson) {
            return resolve(prepareNameButtonsWithTimeout());
        }

        const allNames = [correctPerson.name, incorrectPerson.name].sort(() => Math.random() - 0.5);
        createNameButtons(allNames);
        resolve(allNames);
    });
}



    /**
     * Hides the name buttons and disables interaction.
     */
    function clearNameButtons() {
        nameOptions.innerHTML = ""; // Clear existing buttons
        nameOptions.textContent = "";
        nameOptions.style.display = "none";
    }

    /**
     * Clears the overlay content
     */
    function clearOverlay() {
        wikiInfo.innerHTML = "";
        wikiInfo.textContent = "";
        wikiInfo.style.display = "none";
    }

    /**
     * Clears the result banner area before a new round.
     */
    function clearResultBanner() {
        resultBanner.innerHTML = "";
        resultBanner.textContent = "";
        resultBanner.style.display = "none";
    }



    /**
     * Fetches the Wikipedia summary and updates the overlay extract area.
     * @param {string} wikiTitle - The Wikipedia article title.
     * @returns {Promise<void>}
     */
    function fetchWikiExtract(wikiTitle) {
        const extractElement = document.getElementById("wiki-extract");
        if (extractElement) {
            extractElement.classList.remove("loaded");
            extractElement.textContent = "Loading Wikipedia summary...";
        }

        return fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`)
            .then(response => response.json())
            .then(data => {
                let extract = data.extract || "Sorry, there is no intro available from Wikipedia.";

                if (extract.length > MAX_CHARACTERS) {
                    extract = extract.substring(0, MAX_CHARACTERS) + "...";
                }

                if (extractElement) {
                    extractElement.textContent = extract;
                    extractElement.classList.add("loaded");
                }
            })
            .catch(error => {
                if (extractElement) {
                    extractElement.textContent = "Sorry, I could not load intro from Wikipedia.";
                }
            });
    }

    /**
     * Constructs the HTML for the overlay with placeholder Wikipedia extract.
     */
    function createOverlayHTML(person, wasCorrect) {
        wikiInfo.innerHTML = `
        <div class="overlay ${wasCorrect ? 'overlay-correct' : 'overlay-wrong'}" id="overlay">
          <p class="description">${person.description}</p>
          <h2>${person.name}</h2>
          <p id="wiki-extract"></p>
          <a href="${person.wikipedia}" target="_blank" class="wikipedia-link">Read more on Wikipedia &rarr;</a>
        </div>
    `;
        wikiInfo.style.display = "block";
    }

    /**
     * Adds click and swipe listeners to the overlay to advance to the next round.
     */
    function addOverlayListeners() {
        const overlay = document.getElementById("overlay");
        if (!overlay) return;

        overlay.addEventListener("click", (e) => {
          if (!e.target.closest(".wikipedia-link")) advanceToNextStep();
        });

        let touchStartY = 0;
        let touchEndY = 0;
        overlay.addEventListener("touchstart", (e) => {
            touchStartY = e.changedTouches[0].screenY;
        });
        overlay.addEventListener("touchend", (e) => {
            touchEndY = e.changedTouches[0].screenY;
            if (touchStartY - touchEndY > SWIPE_THRESHOLD) {
                advanceToNextStep();
            }
        });

        // Make sure it can receive keyboard input
        overlay.setAttribute("tabindex", "0");
        overlay.focus(); // This is important to receive keydown
        overlay.addEventListener("keydown", (e) => {
            if (["Space", "Enter"].includes(e.code)) {
                advanceToNextStep();
            }
        });
    }

/**
 * Determines the next game step based on the current score and screen state.
 * - If the Make or Break screen is visible, it removes it and starts a new round.
 * - If the score is tied at MAX_ROUNDS - 1, it shows the Make or Break screen.
 * - Otherwise, it simply proceeds to the next round.
 */
function advanceToNextStep() {
  try {
    const makeOrBreak = document.getElementById("make-or-break");

    if (makeOrBreak) {
      makeOrBreak.remove();
      loadNewRound();
    } else if (score.correct === MAX_ROUNDS - 1 && score.wrong === MAX_ROUNDS - 1) {
      showMakeOrBreakScreen();
    } else {
      loadNewRound();
    }

  } catch (error) {
    console.error("Error advancing to next step:", error);
  }
}



    /**
     * Shows the overlay after Wikipedia data has loaded.
     * @param {string} name
     * @param {string} wikipediaURL
     * @param {boolean} wasCorrect
     */
    async function showPersonOverlay(person, wasCorrect) {
        /* Showing a person overlay involves: */

        /* 1 - Creating the overlay HTML */
        createOverlayHTML(person, wasCorrect);

        /* 2 - Fetching the Wikipedia extract */
        await fetchWikiExtract(person.wikipedia.split("/").pop());

        /* 3 - Delayed adding of click/swipe listeners to the overlay */
        // ⏳ Delay adding click/swipe/spacebar listeners to prevent accidental skipping
        setTimeout(() => {
            addOverlayListeners();
        }, NEXT_ROUND_LOCK);
    }

    //=================END Overlay related stuff

    // ===== New game round functions
    /**
     * Loads a new game round by selecting a unique pair of people,
     * updating the UI and safely handling image transitions.
     */
    async function loadNewRound() {
        if (portraits.length < 2) return; // Prevent loading if not enough data

        roundPlayed = false;

        /* Loading a new round involves: */
        /* 1 - Clearing the result banner  */
        clearResultBanner();
        /* 2 - Clearing the overlay  */
        clearOverlay();
        /* 3 - Loading the names pair buttons */
        const namesPair = await showNameButtonsWithTimeout();
        /* 4 - Loading the portrait image. This needs to happen *after* name buttons have been loaded in step 3. */
        handlePortraitLoadAndDisplay(correctPerson.image, () => {
            nameOptions.style.display = "flex";
        });
        if (DEBUG_MODE) {logUsedNamePairs();}
    }

    function handleRoundResult(event) {
        roundPlayed = true;
        const selectedName = event.target.textContent;
        let wasCorrect = false;
        let happyFace = '<img src="media/green-smiley.png" alt="Happy">';
        let sadFace = '<img src="media/red-sadface.png" alt="Sad">';

        if (selectedName === correctPerson.name) {
            score.correct++;
            resultBanner.innerHTML = `${happyFace} <span>Spot on! This was ${correctPerson.name}.</span>`;
            wasCorrect = true;
        }
        else {
            score.wrong++;
            resultBanner.innerHTML = `${sadFace} <span>Oh, no! This was not ${incorrectPerson.name}, it was ${correctPerson.name}.</span>`;
        }

        // Now display all results stuff
       resultBanner.style.display = "flex"; // Show message with flexbox
       showAndUpdateScoreBoard();
       clearNameButtons();
       showPersonOverlay(correctPerson, wasCorrect);

        // Deze hierdner nog chcken, wanner dee precie moet triggeren!!!
        //checkGameEnd()
    }



/**
 * Visually updates the scoreboard with the current number of correct and wrong answers.
 * Each row shows a count label followed by a row of circles representing progress.
 * Green = correct, red = wrong. Filled circles indicate number achieved.
 */
function showAndUpdateScoreBoard() {
    try {
        scoreBoard.innerHTML = "";

        const stats = [
            { count: score.correct, labelClass: "score-label", circleBase: "light-green", circleFilled: "dark-green" },
            { count: score.wrong,   labelClass: "score-label", circleBase: "light-red",   circleFilled: "dark-red" }
        ];

        stats.forEach(({ count, labelClass, circleBase, circleFilled }) => {
            const row = document.createElement("div");
            row.classList.add("score-row");

            const label = document.createElement("span");
            label.textContent = `${count}`;
            label.classList.add(labelClass);
            row.appendChild(label);

            for (let i = 0; i < MAX_ROUNDS; i++) {
                const circle = document.createElement("div");
                circle.classList.add("score-circle", circleBase);
                if (i < count) {
                    circle.classList.add(circleFilled);
                }
                row.appendChild(circle);
            }

            scoreBoard.appendChild(row);
        });

    } catch (error) {
        console.error("⚠️ Error updating scoreboard:", error);
    }
}

/**
 * Displays a temporary "Make or Break" overlay with a dramatic message,
 * then waits for user interaction (click, touch, or key press) to proceed.
 * Calls the global `advanceToNextStep()` when interaction is detected.
 */
function showMakeOrBreakScreen() {
    try {
        const makeOrBreakOverlay = document.createElement("div");
        makeOrBreakOverlay.id = "make-or-break";
        makeOrBreakOverlay.className = "make-or-break-screen";

        makeOrBreakOverlay.innerHTML = `
            <div class="make-or-break-text">${MAX_ROUNDS - 1} - ${MAX_ROUNDS - 1}</div>
            <div class="make-or-break-text">Make or break!</div>
        `;

        // Make the overlay focusable to detect key events
        makeOrBreakOverlay.setAttribute("tabindex", "10");
        document.body.appendChild(makeOrBreakOverlay);
        makeOrBreakOverlay.focus();

        // Add event listeners to proceed on interaction
        // NOT: advanceToNextStep() with the parentheses!
        makeOrBreakOverlay.addEventListener("click", advanceToNextStep, { once: true });
        makeOrBreakOverlay.addEventListener("touchstart", advanceToNextStep, { once: true });

        makeOrBreakOverlay.addEventListener("keydown", (e) => {
            if (["Space", "Enter"].includes(e.code)) {
                advanceToNextStep(); // NOT: advanceToNextStep without the parentheses!
            }
        }, { once: true });

    } catch (error) {
        console.error("Error showing Make or Break screen:", error);
    }
}



    // Still to worl on game and and loading the next round of games
    function checkGameEnd() {
        let gifURL = "";
        let messageText = "";
        if (score.correct >= MAX_ROUNDS) {
            gifURL = "https://i.pinimg.com/originals/ee/42/d9/ee42d91ece376e6847f6941b72269c76.gif";
            messageText = "🎉 You won the game! 🎉";
        }
        else if (score.wrong >= MAX_ROUNDS) {
            gifURL = "https://i.pinimg.com/originals/0e/46/23/0e4623557c805b3462daed47c2c0d4b6.gif";
            messageText = "😢 You lost the game! Try again.";
        }

        if (gifURL) {
            setTimeout(() => {
                const endMessage = document.createElement("div");
                endMessage.id = "end-message";

                const countdownElement = document.createElement("div");
                countdownElement.className = "countdown-text";
                let countdown = GAME_END_COUNTDOWN_START;
                countdownElement.textContent = `New game will start in ${countdown} seconds`;

                const interval = setInterval(() => {
                    countdown--;
                    if (countdown <= 0) {
                        clearInterval(interval);
                        document.body.removeChild(endMessage);
                        document.body.style.pointerEvents = "auto";
                        resetGame();
                        //loadNewRound();
                        wikiInfo.innerHTML = "";
                        wikiInfo.style.display = "none";
                    }
                    else {
                        countdownElement.textContent = `New game will start in ${countdown} seconds`;
                    }
                }, GAME_END_INTERVAL_DELAY); // 🔄 use global constant here

                endMessage.innerHTML = `
                    <div class="end-text">${messageText}</div>
                    <img src="${gifURL}" alt="Game Over">
                `;
                endMessage.appendChild(countdownElement);

                // Disable interaction with everything else
                document.body.style.pointerEvents = "none";
                endMessage.style.pointerEvents = "none";

                // Also disable interaction with the final overlay
                const overlay = document.querySelector(".overlay");
                if (overlay) {
                    overlay.style.pointerEvents = "none";
                    overlay.style.touchAction = "none";
                }

                document.body.appendChild(endMessage);
            }, GAME_END_DISPLAY_DELAY); // Delay before showing end screen
        }
    }

    function resetGame() {
        score.correct = 0;
        score.wrong = 0;
        showAndUpdateScoreBoard();
    }

    /**
     * Asynchronously fetches the CSV data for portraits,
     * parses it, updates the scoreboard, and starts a new round.
     */
    async function fetchPortraits() {
        try {
            const response = await fetch(DATA_FILE);
            const text = await response.text();
            portraits = parseCSV(text);
            showAndUpdateScoreBoard();
            loadNewRound();
        }
        catch (error) {
            console.error("Error fetching portraits:", error);
        }
    }

    // ================= Main function stuff

    fetchPortraits();
});