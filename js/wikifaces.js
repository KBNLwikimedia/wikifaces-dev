// For usage in https://jshint.com/
/* jshint esversion: 8 */
document.addEventListener("DOMContentLoaded", function() {
    const DATA_FILE = "data/wikifaces-datacache2.csv";
    const MAX_ROUNDS = 5; // Configurable number of rounds = number of circles in the scoreboard
    const MAX_CHARACTERS = 250; // Maximum characters to show in Wikipedia extract, fetched from API

    // === Global Timeout Configurations - in milliseconds ===
    const BUTTON_SHOW_DELAY = 300; // Interval between showing the portrait and showing the name buttons
    const IMAGE_LOADING_MESSAGE_DELAY = 5000; // Max wait time before "loadingNotice.textContent = "⏳ Hold on, image still loading...";" is shown
    const IMAGE_ERROR_DISPLAY_DURATION = 10000; // How long the image loading error message is shown (ms)

    const SWIPE_THRESHOLD = 100; // Minimum swipe distance to trigger next round

    // When the result banner is shown (✅ or ❌), this defines how long interaction is locked afterward to prevent double-pressing or skipping too quickly.
    NEXT_ROUND_LOCK = 1000; // Lock interaction after showing result banner and overlay (ms) - user can't click too quickly and progress to next round

    // Need to better understand the following constants
    const GAME_END_DISPLAY_DELAY = 1600; // Delay before showing win/loss GIF (ms)
    const GAME_END_COUNTDOWN_START = 5; // Countdown seconds after game ends and new game begin
    const GAME_END_INTERVAL_DELAY = 1000; // Countdown tick interval (ms)

    const NAME_SELECTION_TIMEOUT = 1000; // 1 seconds, if it takes longer to select names, show a message

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
    let nextRoundLocked = false;

    const gameContainer = document.getElementById("game-container");
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

    /**
     * Clears the result banner area before a new round.
     */
    function clearResultBanner() {
        resultBanner.textContent = "";
        resultBanner.style.display = "none";
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
        portraitElement.classList.add("fade-in");

        setTimeout(() => {
            portraitElement.classList.remove("fade-in");
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

    function showNameSelectionNotice() {
        const notice = document.createElement("div");
        notice.id = "name-selection-notice";
        notice.className = "name-selection-notice";
        notice.textContent = "⏳ Selecting people...";
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
     * Selects and prepares names with a fallback timeout message.
     * @returns {Promise<Array>} - Resolves with shuffled names.
     */
    function prepareNameButtonsWithTimeout() {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                showNameSelectionNotice();
            }, NAME_SELECTION_TIMEOUT);

            const uniqueNameKeys = [...new Set(portraits.map(p => p.namekey))];
            let selectedNameKey, nameGroup;

            do {
                selectedNameKey = uniqueNameKeys[Math.floor(Math.random() * uniqueNameKeys.length)];
            } while (usedNameKeys.has(selectedNameKey));

            usedNameKeys.add(selectedNameKey);
            nameGroup = portraits.filter(p => p.namekey === selectedNameKey);
            if (nameGroup.length < 2) return resolve(prepareNameButtonsWithTimeout());

            [correctPerson, incorrectPerson] = selectUniquePairFrom(nameGroup);

            clearTimeout(timeout);
            removeNameSelectionNotice();

            const allNames = randomShuffleTwoNames(correctPerson.name, incorrectPerson.name);
            createNameButtons(allNames);
            resolve(allNames);
        });
    }

    /**
     * Dynamically creates name selection buttons.
     * @param {Array} allNames - Names to display.
     */
    function createNameButtons(allNames) {
        nameOptions.innerHTML = "";
        const nameWrapper = document.createElement("div");
        nameWrapper.classList.add("name-wrapper");

        allNames.forEach((name, index) => {
            const button = document.createElement("name-button");
            button.textContent = name;
            button.classList.add("name-button");
            button.disabled = false;
            button.addEventListener("click", handleRoundResult);
            nameWrapper.appendChild(button);

            /* ✅ Add an "OR" divider between the two names if there are more names to show */
            if (index === 0 && allNames.length > 1) {
                const orDivider = document.createElement("div");
                orDivider.textContent = "OR";
                orDivider.classList.add("or-divider");
                nameWrapper.appendChild(orDivider);
            }
        });

        nameOptions.appendChild(nameWrapper);
    }

    /**
     * Hides the name buttons and disables interaction.
     */
    function hideNameButtons() {
        nameOptions.style.display = "none";
        document.querySelectorAll(".name-button").forEach(button => {
            button.disabled = true;
        });
    }

    // ==== End of button related stuff

    //=================BEGIN Overlay related stuff

    /**
     * Clears the overlay content
     */
    function clearOverlay() {
        wikiInfo.textContent = "";
        wikiInfo.style.display = "none";
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
    function createOverlayHTML(name, wikipediaURL, wasCorrect) {
        wikiInfo.innerHTML = `
        <div class="overlay ${wasCorrect ? 'overlay-correct' : 'overlay-wrong'}" id="overlay">
          <p class="description">${correctPerson.description}</p>
          <h2>${name}</h2>
          <p id="wiki-extract"></p>
          <a href="${wikipediaURL}" target="_blank" class="wikipedia-link">Read more on Wikipedia &rarr;</a>
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

        overlay.addEventListener("click", (event) => {
            if (event.target.closest(".wikipedia-link")) return;
            loadNewRound();
        });

        let touchStartY = 0;
        let touchEndY = 0;
        overlay.addEventListener("touchstart", (event) => {
            touchStartY = event.changedTouches[0].screenY;
        });
        overlay.addEventListener("touchend", (event) => {
            touchEndY = event.changedTouches[0].screenY;
            if (touchStartY - touchEndY > SWIPE_THRESHOLD) {
                loadNewRound();
            }
        });

        // Make sure it can receive keyboard input
        overlay.setAttribute("tabindex", "0");
        overlay.focus(); // This is important to receive keydown
        overlay.addEventListener("keydown", (event) => {
            if (event.code === "Space" || event.code === "Enter") {
                loadNewRound();
            }
        });
    }

    /**
     * Shows the overlay after Wikipedia data has loaded.
     * @param {string} name
     * @param {string} wikipediaURL
     * @param {boolean} wasCorrect
     */
    async function showPersonOverlay(name, wikipediaURL, wasCorrect) {
        /* Showing a person overlay involves: */

        /* 1 - Creating the overlay HTML */
        createOverlayHTML(name, wikipediaURL, wasCorrect);

        /* 2 - Fetching the Wikipedia extract */
        await fetchWikiExtract(wikipediaURL.split("/").pop());

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
        /* 3 - Loading the name buttons */
        const allNames = await prepareNameButtonsWithTimeout();
        /* 4 - Loading the portrait image. This needs to happen *after* name buttons have been loaded in step 3. */
        handlePortraitLoadAndDisplay(correctPerson.image, () => {
            nameOptions.style.display = "flex";
        });
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
        setTimeout(() => {
            resultBanner.style.display = "flex"; // Show message with flexbox
            showAndUpdateScoreBoard();
            hideNameButtons();
            showPersonOverlay(correctPerson.name, correctPerson.wikipedia, wasCorrect);
        }, 350);

        // Deze hierdner nog chcken, wanner dee precie moet triggeren!!!
        //checkGameEnd()
    }

    /**
     * Updates the visual scoreboard with correct/wrong counts and circles.
     */
    function showAndUpdateScoreBoard() {
        scoreBoard.innerHTML = "";

        const correctRow = document.createElement("div");
        const correctLabel = document.createElement("span");
        correctLabel.textContent = `${score.correct}`;
        correctLabel.classList.add("score-label");
        correctRow.classList.add("score-row");
        correctRow.appendChild(correctLabel);

        const wrongRow = document.createElement("div");
        const wrongLabel = document.createElement("span");
        wrongLabel.textContent = `${score.wrong}`;
        wrongLabel.classList.add("score-label");
        wrongRow.classList.add("score-row");
        wrongRow.appendChild(wrongLabel);

        for (let i = 0; i < MAX_ROUNDS; i++) {
            const correctCircle = document.createElement("div");
            correctCircle.classList.add("score-circle", "light-green");
            if (i < score.correct) {
                correctCircle.classList.add("dark-green");
            }
            correctRow.appendChild(correctCircle);

            const wrongCircle = document.createElement("div");
            wrongCircle.classList.add("score-circle", "light-red");
            if (i < score.wrong) {
                wrongCircle.classList.add("dark-red");
            }
            wrongRow.appendChild(wrongCircle);
        }

        scoreBoard.appendChild(correctRow);
        scoreBoard.appendChild(wrongRow);
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