// For usage in https://jshint.com/
/* jshint esversion: 8 */
document.addEventListener("DOMContentLoaded", function() {
    const DEBUG_MODE = true;
    const DATA_FILE = "data/wikifaces-datacache.csv";
    const MAX_ROUNDS = 5; // Configurable number of rounds = number of circles in the scoreboard
    const MAX_CHARACTERS = 250; // Maximum characters to show in Wikipedia extract, fetched from API

    // === Global Timeout Configurations - in milliseconds ===
    const BUTTON_SHOW_DELAY = 500; // Interval between showing the portrait and showing the name buttons
    const IMAGE_LOADING_MESSAGE_DELAY = 5000; // Max wait time before "loadingNotice.textContent = "⏳ Hold on, image still loading...";" is shown
    const IMAGE_ERROR_DISPLAY_DURATION = 10000; // How long the image loading error message is shown (ms)
    const NAME_SELECTION_TIMEOUT = 1000; // 1 second, if it takes longer to select name pair, show a message
    const SWIPE_THRESHOLD = 100; // Minimum swipe distance to trigger next round
    // When the result banner is shown (✅ or ❌), this defines how long interaction is locked afterward to prevent double-pressing or skipping too quickly.
    const NEXT_ROUND_LOCK = 1000; // Lock interaction after showing result banner and overlay (ms) - user can't click too quickly and progress to next round

    // Need to better understand the following constants
    const GAME_END_DISPLAY_DELAY = 1600; // Delay before showing win/loss GIF (ms)
    const GAME_END_COUNTDOWN_START = 5; // Countdown seconds after game ends and new game begin
    const GAME_END_INTERVAL_DELAY = 1000; // Countdown tick interval (ms)

    let portraits = [];
    let correctPerson = null;
    let incorrectPerson = null;
    let score = {
        correct: 0,
        wrong: 0
    };
    let roundPlayed = false;
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
     * Loads a portrait image with timeout handling and shows it with a spinner.
     * If the image loads successfully, it fades in the portrait and runs a callback.
     * If the spinner is not found or an error occurs during loading/display, logs the error.
     *
     * @param {string} src - Image source URL.
     * @param {function} onComplete - Callback to run after image is shown.
     */
    function handlePortraitLoadAndDisplay(src, onComplete) {
        try {
            const spinner = document.getElementById("portrait-spinner");
            if (spinner) spinner.style.display = "block";

            loadPortraitImage(src, () => {
                if (spinner) spinner.style.display = "none";
                displayLoadedPortrait(onComplete);
            });

        }
        catch (error) {
            console.error("Error loading or displaying portrait image:", error);
            if (typeof onComplete === "function") {
                onComplete(); // Fallback to continue app flow
            }
        }
    }

    /**
     * Attempts to load an image and handles success, timeout, and error cases.
     * Shows a loading notice if the image takes too long to load.
     * Displays an error message if the image fails to load entirely.
     *
     * @param {string} src - The image source URL to load.
     * @param {function} onLoad - Callback to execute when the image is successfully loaded.
     */
    function loadPortraitImage(src, onLoad, delay = IMAGE_LOADING_MESSAGE_DELAY) {
        try {
            const img = new Image();
            img.src = src;

            const timeout = setTimeout(() => {
                console.warn("⏳ Image load timeout:", src);
                showImageLoadingNotice();
            }, delay);

            img.onload = () => {
                clearTimeout(timeout);
                removeImageLoadingNotice();
                if (typeof onLoad === "function") {
                    onLoad();
                }
            };

            img.onerror = () => {
                clearTimeout(timeout);
                console.error("❌ Image failed to load:", src);
                showImageLoadError();
            };
        }
        catch (error) {
            console.error("Unexpected error during image loading:", error);
            showImageLoadError();
        }
    }

    /**
     * Displays the loaded portrait image with a fade-in effect,
     * then triggers a callback (usually to reveal the name buttons).
     *
     * @param {function} callback - A function to execute after the portrait is shown.
     */
    function displayLoadedPortrait(callback, duration = BUTTON_SHOW_DELAY) {
        try {
            if (!portraitElement || !correctPerson || !correctPerson.image) {
                throw new Error("Missing portrait element or image data.");
            }

            portraitElement.style.backgroundImage = `url(${correctPerson.image})`;
            portraitElement.classList.add("fade-in");

            setTimeout(() => {
                portraitElement.classList.remove("fade-in");
                if (typeof callback === "function") {
                    callback();
                }
            }, duration);
        }
        catch (error) {
            console.error("Failed to display portrait:", error);
            showImageLoadError(); // Optional fallback error display
        }
    }

    /**
     * Displays a visual notice informing the user that the portrait image is still loading.
     * Intended to appear after a loading delay to reassure users during slower connections.
     */
    function showImageLoadingNotice() {
        try {
            // Avoid showing duplicate notices
            if (document.getElementById("portrait-loading-notice")) return;

            const loadingNotice = document.createElement("div");
            loadingNotice.id = "portrait-loading-notice";
            loadingNotice.className = "portrait-loading-notice";
            loadingNotice.textContent = "⏳ Hold on, image still loading...";

            document.body.appendChild(loadingNotice);
        }
        catch (error) {
            console.error("Failed to show image loading notice:", error);
        }
    }

    /**
     * Removes the visual notice that was shown during image loading.
     * Ensures the message is dismissed once the image is successfully loaded or fails.
     */
    function removeImageLoadingNotice() {
        try {
            const notice = document.getElementById("portrait-loading-notice");
            if (notice && notice.parentElement) {
                notice.parentElement.removeChild(notice);
            }
        }
        catch (error) {
            console.error("Failed to remove image loading notice:", error);
        }
    }

    /**
     * Displays an error message on the screen if an image fails to load.
     * The message is temporary and automatically removed after a delay.
     *
     * @param {number} duration - How long the error message remains visible (in ms).
     */
    function showImageLoadError(duration = IMAGE_ERROR_DISPLAY_DURATION) {
        try {
            const errorMessage = document.createElement("div");
            errorMessage.textContent = "⚠️ Failed to load image. Please try again.";
            errorMessage.className = "portrait-load-error"; // No leading dot!

            document.body.appendChild(errorMessage);

            setTimeout(() => {
                if (errorMessage.parentElement) {
                    errorMessage.parentElement.removeChild(errorMessage);
                }
            }, duration);
        }
        catch (error) {
            console.error("Failed to display or remove image load error message:", error);
        }
    }

    //******** Image loading stuff ends here

    // ==== Start of button related stuff

    /**
     * Displays a temporary on-screen notice while selecting two random people.
     * Typically used when the name selection process takes longer than expected.
     */
    function showNameSelectionNotice() {
        try {
            const notice = document.createElement("div");
            notice.id = "name-selection-notice";
            notice.className = "name-selection-notice";
            notice.textContent = "⏳ Please wait, selecting two random persons...";
            document.body.appendChild(notice);
        }
        catch (error) {
            console.error("Failed to show name selection notice:", error);
        }
    }

    /**
     * Removes the name selection notice from the DOM, if it exists.
     */
    function removeNameSelectionNotice() {
        try {
            const notice = document.getElementById("name-selection-notice");
            if (notice && notice.parentElement) {
                notice.parentElement.removeChild(notice);
            }
        }
        catch (error) {
            console.error("Failed to remove name selection notice:", error);
        }
    }

    /**
     * Logs all previously used person pairs by their display names and Wikidata IDs.
     * Falls back to showing IDs if names can't be found.
     */
    function logUsedNamePairs() {
        try {
            if (!Array.isArray(portraits) || portraits.length === 0) {
                console.warn("Portrait data not available for logging used name pairs.");
                return;
            }

            console.log("✅ Used name pairs:");
            Array.from(usedPairs).forEach((key) => {
                const [id1, id2] = key.split("|");
                const person1 = portraits.find(p => p.depicts === id1);
                const person2 = portraits.find(p => p.depicts === id2);

                if (person1 && person2) {
                    console.log(`- ${person1.name} (${id1}) ↔ ${person2.name} (${id2})`);
                }
                else {
                    console.log(`- Unknown Pair: ${id1} ↔ ${id2}`);
                }
            });
        }
        catch (error) {
            console.error("Failed to log used name pairs:", error);
        }
    }

    /**
     * Selects a unique unordered pair of distinct people from the given group.
     * Ensures the pair has not been used before in the current game session.
     *
     * @param {Array} nameGroup - Array of people sharing the same name key.
     * @returns {[Object, Object]} A unique pair of distinct person objects.
     */
    function selectUniquePairFrom(nameGroup) {
        try {
            if (!Array.isArray(nameGroup) || nameGroup.length < 2) {
                console.warn("Invalid or too small name group:", nameGroup);
                return [null, null];
            }

            let pair, pairKey;
            let attempts = 0;
            const maxAttempts = 50;

            do {
                pair = getTwoDistinctPeople(nameGroup);
                if (!pair[0] || !pair[1]) return [null, null];

                pairKey = [pair[0].depicts, pair[1].depicts].sort().join("|");
                attempts++;
            } while (usedPairs.has(pairKey) && attempts < maxAttempts);

            if (attempts >= maxAttempts) {
                console.error("Unable to find unique pair after many attempts.");
                return [null, null];
            }

            usedPairs.add(pairKey);
            return pair;
        }
        catch (error) {
            console.error("Error selecting unique pair from name group:", error);
            return [null, null];
        }
    }

    /**
     * Selects and returns two distinct, randomly chosen people from a group.
     * If the group contains fewer than two people, returns [null, null].
     *
     * @param {Array} group - Array of people with the same name.
     * @returns {[Object|null, Object|null]} - A pair of distinct person objects, or [null, null] if not possible.
     */
    function getTwoDistinctPeople(group) {
        try {
            if (!Array.isArray(group)) {
                console.error("Expected an array but got:", group);
                return [null, null];
            }

            if (group.length < 2) return [null, null];

            let firstIndex = Math.floor(Math.random() * group.length);
            let secondIndex;
            do {
                secondIndex = Math.floor(Math.random() * group.length);
            } while (secondIndex === firstIndex);

            return [group[firstIndex], group[secondIndex]];
        }
        catch (error) {
            console.error("Error selecting two distinct people:", error);
            return [null, null];
        }
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

        }
        catch (error) {
            console.error("Failed to create name buttons:", error);
        }
    }

    /**
     * Shows name selection buttons after selecting a valid, unused pair of people.
     * Displays a loading notice if name selection takes longer than the specified timeout.
     * Retries up to 100 attempts to find a unique pair from available name groups.
     *
     * @param {number} delay - Timeout duration in milliseconds before showing a loading notice.
     * @returns {Promise<Array<string>>} Resolves with the shuffled name pair.
     */
    function showNameButtonsWithTimeout(delay = NAME_SELECTION_TIMEOUT) {
        return new Promise((resolve) => {
            try {
                const timeoutId = setTimeout(showNameSelectionNotice, delay);

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

                clearTimeout(timeoutId);
                removeNameSelectionNotice();

                if (!correctPerson || !incorrectPerson) {
                    console.warn("No valid name pair found. Retrying...");
                    return resolve(showNameButtonsWithTimeout()); // Retry if needed
                }

                const allNames = [correctPerson.name, incorrectPerson.name].sort(() => Math.random() - 0.5);
                createNameButtons(allNames);
                resolve(allNames);
            }
            catch (error) {
                console.error("Error during name button preparation:", error);
                removeNameSelectionNotice();
                resolve([]); // Fallback to empty list if error occurs
            }
        });
    }

    /**
     * Hides and clears the name buttons area.
     * Ensures no lingering content or active display remains.
     */
    function clearNameButtons() {
        try {
            nameOptions.innerHTML = "";
            nameOptions.style.display = "none";
        }
        catch (error) {
            console.error("Failed to clear name buttons:", error);
        }
    }

    /**
     * Hides and clears the overlay (Wikipedia information area).
     * Used before rendering a new overlay or when exiting a round.
     */
    function clearOverlay() {
        try {
            wikiInfo.innerHTML = "";
            wikiInfo.style.display = "none";
        }
        catch (error) {
            console.error("Failed to clear overlay:", error);
        }
    }

    /**
     * Hides and clears the result banner (correct/wrong feedback).
     * Used before starting the next round.
     */
    function clearResultBanner() {
        try {
            resultBanner.innerHTML = "";
            resultBanner.style.display = "none";
        }
        catch (error) {
            console.error("Failed to clear result banner:", error);
        }
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
     * Constructs and displays the overlay containing person details and a placeholder for the Wikipedia summary.
     *
     * @param {Object} person - The person to display (should have `name`, `description`, and `wikipedia` fields).
     * @param {boolean} wasCorrect - Whether the guess was correct (controls overlay styling).
     */
    function createOverlayHTML(person, wasCorrect) {
        try {
            if (!person || !person.name || !person.description || !person.wikipedia) {
                throw new Error("Invalid person object passed to createOverlayHTML");
            }

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
        catch (error) {
            console.error("Failed to create overlay HTML:", error);
        }
    }

    /**
     * Adds click, swipe, and keyboard listeners to the overlay element
     * to allow the user to proceed to the next round.
     *
     * @param {number} threshold - Minimum swipe distance (in pixels) to trigger next round (default: SWIPE_THRESHOLD).
     */
    function addOverlayListeners(threshold = SWIPE_THRESHOLD) {
        try {
            const overlay = document.getElementById("overlay");
            if (!overlay) {
                console.warn("No overlay element found to attach listeners.");
                return;
            }

            // ✅ CLICK: Only trigger if not clicking the Wikipedia link
            overlay.addEventListener("click", (e) => {
                if (!e.target.closest(".wikipedia-link")) {
                    advanceToNextStep();
                }
            });

            // ✅ SWIPE: Track vertical swipe gesture
            let touchStartY = 0;
            let touchEndY = 0;

            overlay.addEventListener("touchstart", (e) => {
                touchStartY = e.changedTouches[0].screenY;
            });

            overlay.addEventListener("touchend", (e) => {
                touchEndY = e.changedTouches[0].screenY;
                if (touchStartY - touchEndY > threshold) {
                    advanceToNextStep();
                }
            });

            // ✅ KEYBOARD: Enable spacebar/enter interaction
            overlay.setAttribute("tabindex", "0");
            overlay.focus(); // Important to allow keydown events
            overlay.addEventListener("keydown", (e) => {
                if (["Space", "Enter"].includes(e.code)) {
                    advanceToNextStep();
                }
            });

        }
        catch (error) {
            console.error("Failed to attach overlay interaction listeners:", error);
        }
    }

    /**
     * Determines the next game step based on the current score and screen state.
     * - If the Make or Break screen is visible, it removes it and starts a new round.
     * - If the score is tied at MAX_ROUNDS - 1, it shows the Make or Break screen.
     * - Otherwise, it simply proceeds to the next round.
     */
    function advanceToNextStep(maxrounds = MAX_ROUNDS) {
        try {
            const makeOrBreak = document.getElementById("make-or-break");

            if (makeOrBreak) {
                makeOrBreak.remove();
                loadNewRound();
            }
            else if (score.correct === maxrounds - 1 && score.wrong === maxrounds - 1) {
                showMakeOrBreakScreen();
            }
            else {
                loadNewRound();
            }

        }
        catch (error) {
            console.error("Error advancing to next step:", error);
        }
    }

    /**
     * Displays the person overlay after loading Wikipedia data,
     * and sets up interaction listeners after a short delay.
     *
     * @param {Object} person - The person object containing name, description, and Wikipedia link.
     * @param {boolean} wasCorrect - Whether the player's guess was correct.
     * @param {number} [lockduration=NEXT_ROUND_LOCK] - Delay in milliseconds before interaction is allowed.
     */
    async function showPersonOverlay(person, wasCorrect, lockduration = NEXT_ROUND_LOCK) {
        try {
            // 1. Inject overlay HTML for the person
            createOverlayHTML(person, wasCorrect);

            // 2. Load Wikipedia summary for the person
            await fetchWikiExtract(person.wikipedia.split("/").pop());

            // 3. Delay before enabling interaction (click, swipe, keyboard)
            setTimeout(() => {
                addOverlayListeners();
            }, lockduration);

        }
        catch (error) {
            console.error("Error showing person overlay:", error);
        }
    }

    //=================END Overlay related stuff

    // ===== New game round functions
    /**
     * Loads a new game round by:
     * 1. Clearing previous UI state
     * 2. Selecting a new unique name pair
     * 3. Displaying the corresponding buttons and portrait image
     * 4. Logging debug information if enabled
     */
    async function loadNewRound() {
        try {
            if (portraits.length < 2) return; // Prevent loading if insufficient data

            roundPlayed = false;

            // 1. Reset the previous state
            clearResultBanner();
            clearOverlay();

            // 2. Load the new name buttons (ensures unique pair)
            const namesPair = await showNameButtonsWithTimeout();

            // 3. Load and display the portrait image after names are shown
            handlePortraitLoadAndDisplay(correctPerson.image, () => {
                nameOptions.style.display = "flex";
            });

            // 4. Optionally log debug info
            if (DEBUG_MODE) {
                logUsedNamePairs();
            }
        }
        catch (error) {
            console.error("Failed to load new round:", error);
        }
    }

    /**
     * Handles user selection and updates the UI with feedback,
     * the correct answer, and the new overlay. Also updates the score.
     * @param {Event} event - The click event from the selected name button.
     */
    function handleRoundResult(event) {
        try {
            roundPlayed = true;
            const selectedName = event.target.textContent;
            let wasCorrect = false;

            const happyFace = '<img src="media/green-smiley.png" alt="Happy">';
            const sadFace = '<img src="media/red-sadface.png" alt="Sad">';

            if (selectedName === correctPerson.name) {
                score.correct++;
                resultBanner.innerHTML = `${happyFace} <span>Spot on! This is ${correctPerson.name}.</span>`;
                wasCorrect = true;
            }
            else {
                score.wrong++;
                resultBanner.innerHTML = `${sadFace} <span>Oh, no! This is not ${incorrectPerson.name}, it is ${correctPerson.name}.</span>`;
            }

            // Show result banner
            resultBanner.style.display = "flex";
            showAndUpdateScoreBoard();
            clearNameButtons();

            // Show overlay with Wikipedia info and next-step interactions
            showPersonOverlay(correctPerson, wasCorrect);

            // Optional: add checkGameEnd() here later if you want to conditionally end the game
            // checkGameEnd();

        }
        catch (error) {
            console.error("Error handling round result:", error);
        }
    }

    /**
     * Visually updates the scoreboard UI with current correct and wrong answer counts.
     * - Each row shows a numeric label followed by a series of progress circles.
     * - Green = correct answers, Red = incorrect answers.
     * - Filled circles indicate how many have been achieved.
     *
     * @param {number} maxRounds - The total number of rounds in the game (default is MAX_ROUNDS).
     */
    function showAndUpdateScoreBoard(maxRounds = MAX_ROUNDS) {
        try {
            scoreBoard.innerHTML = "";

            const categories = [{
                    count: score.correct,
                    baseColor: "light-green",
                    fillColor: "dark-green"
                },
                {
                    count: score.wrong,
                    baseColor: "light-red",
                    fillColor: "dark-red"
                }
            ];

            categories.forEach(({
                count,
                baseColor,
                fillColor
            }) => {
                const row = document.createElement("div");
                row.classList.add("score-row");

                const countLabel = document.createElement("span");
                countLabel.textContent = `${count}`;
                countLabel.classList.add("score-label");
                row.appendChild(countLabel);

                for (let i = 0; i < maxRounds; i++) {
                    const circle = document.createElement("div");
                    circle.classList.add("score-circle", baseColor);
                    if (i < count) {
                        circle.classList.add(fillColor);
                    }
                    row.appendChild(circle);
                }

                scoreBoard.appendChild(row);
            });

        }
        catch (error) {
            console.error("⚠️ Error updating scoreboard:", error);
        }
    }

    /**
     * Displays a temporary "Make or Break" overlay with a dramatic message,
     * then waits for user interaction (click, touch, or key press) to proceed.
     * Calls the global `advanceToNextStep()` when interaction is detected.
     */
    function showMakeOrBreakScreen(maxrounds = MAX_ROUNDS) {
        try {
            const makeOrBreakOverlay = document.createElement("div");
            makeOrBreakOverlay.id = "make-or-break";
            makeOrBreakOverlay.className = "make-or-break-screen";

            makeOrBreakOverlay.innerHTML = `
            <div class="make-or-break-text">${maxrounds - 1} - ${maxrounds - 1}</div>
            <div class="make-or-break-text">Make or break!</div>
        `;

            // Make the overlay focusable to detect key events
            makeOrBreakOverlay.setAttribute("tabindex", "10");
            document.body.appendChild(makeOrBreakOverlay);
            makeOrBreakOverlay.focus();

            // Add event listeners to proceed on interaction
            // NOT: advanceToNextStep() with the parentheses!
            makeOrBreakOverlay.addEventListener("click", advanceToNextStep, {
                once: true
            });
            makeOrBreakOverlay.addEventListener("touchstart", advanceToNextStep, {
                once: true
            });

            makeOrBreakOverlay.addEventListener("keydown", (e) => {
                if (["Space", "Enter"].includes(e.code)) {
                    advanceToNextStep(); // NOT: advanceToNextStep without the parentheses!
                }
            }, {
                once: true
            });

        }
        catch (error) {
            console.error("Error showing Make or Break screen:", error);
        }
    }

    // Still to worl on game and and loading the next round of games
    function checkGameEnd(maxrounds = MAX_ROUNDS) {
        let gifURL = "";
        let messageText = "";
        if (score.correct >= maxrounds) {
            gifURL = "https://i.pinimg.com/originals/ee/42/d9/ee42d91ece376e6847f6941b72269c76.gif";
            messageText = "🎉 You won the game! 🎉";
        }
        else if (score.wrong >= maxrounds) {
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
    async function fetchPortraits(datafile = DATA_FILE) {
        try {
            const response = await fetch(datafile);
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