// For usage in https://jshint.com/
/* jshint esversion: 8 */

import {
   capitalizeFirstLetter,
   showImageLoadingNotice,
   clearImageLoadingNotice,
   showImageLoadError,
   showNameSelectionNotice,
   clearNameSelectionNotice,
   createNameButtons,
   clearNameButtons,
   fetchWikiExtract,
   createOverlayHTML,
   clearOverlay,
   clearResultBanner,
   showAndUpdateScoreBoard,
   showMakeOrBreakScreen,
   showCleanStrikeScreen,
   renderGameEndOverlay,
   attachPlayAgainButton
} from './renderer.js';

document.addEventListener("DOMContentLoaded", function() {
    const DEBUG_MODE = true;
    const DATA_FILE = "data/wikifaces-datacache.csv";
    const MAX_ROUNDS = 2; // Configurable number of rounds = number of circles in the scoreboard
    const MAX_CHARACTERS = 250; // Maximum characters to show in Wikipedia extract, fetched from API
    // === Global Timeout Configurations - in milliseconds ===
    const BUTTON_SHOW_DELAY = 500; // Interval between showing the portrait and showing the name buttons
    const IMAGE_LOADING_MESSAGE_DELAY = 5000; // Max wait time before "loadingNotice.textContent = "⏳ Hold on, image still loading...";" is shown
    const IMAGE_ERROR_DISPLAY_DURATION = 60000; // How long the image loading error message is shown (ms)
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
                clearImageLoadingNotice();
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
     * then triggers a callback to reveal the name buttons, with a configurable delay.
     *
     * @param {function} callback - A function to execute after the portrait is shown.
     */
    function displayLoadedPortrait(callback, duration = BUTTON_SHOW_DELAY) {
        try {
            if (!portraitElement || !correctPerson || !correctPerson.imageurl) {
                throw new Error("Missing portrait element or image data.");
            }

            portraitElement.style.backgroundImage = `url(${correctPerson.imageurl})`;
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
                const person1 = portraits.find(p => p.person === id1);
                const person2 = portraits.find(p => p.person === id2);

                if (person1 && person2) {
                    console.log(`- ${person1.personLabel} (${id1}) ↔ ${person2.personLabel} (${id2})`);
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
     * Selects and returns two distinct, randomly chosen people from a group (array).
     * If the group contains fewer than two people, returns [null, null].
     *
     * @param {Array} group - Array of people with the same (given) name.
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

                pairKey = [pair[0].person, pair[1].person].sort().join("|");
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
     * Attempts to select a valid pair of distinct people from the dataset.
     * Ensures that the selected pair hasn't already been used in the game.
     *
     * @returns {Array} [correctPerson, incorrectPerson] if successful, or an empty array if none found.
     */
    function selectValidPersonPair() {
        try {
            const uniqueNameKeys = [...new Set(portraits.map(p => p.namekey))];
            let attempts = 0;

            while (attempts < 100) {
                const candidateKey = uniqueNameKeys[Math.floor(Math.random() * uniqueNameKeys.length)];
                const group = portraits.filter(p => p.namekey === candidateKey);

                if (group.length >= 2) {
                    const [p1, p2] = selectUniquePairFrom(group);
                    if (p1 && p2) return [p1, p2];
                }

                attempts++;
            }

            console.warn("⚠️ No valid name pair found after 100 attempts.");
            return [];
        }
        catch (error) {
            console.error("❌ Error while selecting valid person pair:", error);
            return [];
        }
    }



    /**
     * Selects a valid pair of distinct people and renders shuffled name buttons.
     * Displays a loading notice if selection takes longer than the specified delay.
     *
     * @param {number} delay - Time in milliseconds before showing the loading message.
     * @returns {Promise<Array<string>>} Resolves with shuffled name strings or an empty array on error.
     */
    async function showNameButtons(delay = NAME_SELECTION_TIMEOUT) {
        return new Promise((resolve) => {
            const timeoutId = setTimeout(showNameSelectionNotice, delay);

            try {
                const pair = selectValidPersonPair();

                if (!pair || pair.length !== 2) {
                    clearTimeout(timeoutId);
                    clearNameSelectionNotice();
                    console.warn("⚠️ Invalid person pair selected.");
                    return resolve([]);
                }

                [correctPerson, incorrectPerson] = pair;

                const shuffled = [correctPerson.personLabel, incorrectPerson.personLabel]
                    .sort(() => Math.random() - 0.5);

                createNameButtons(shuffled, handleRoundResult);

                clearTimeout(timeoutId);
                clearNameSelectionNotice();
                resolve(shuffled);
            }
            catch (error) {
                clearTimeout(timeoutId);
                clearNameSelectionNotice();
                console.error("⚠️ Failed to show name buttons:", error);
                resolve([]);
            }
        });
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

function advanceToNextStep(maxrounds = MAX_ROUNDS) {
    try {
        const makeOrBreak = document.getElementById("make-or-break");
        const cleanStrike = document.getElementById("clean-strike");
        const gameEndOverlay = document.getElementById("game-end-overlay");

        if (makeOrBreak) {
            makeOrBreak.remove();
            loadNewRound();
        } else if (cleanStrike) {
            cleanStrike.remove();
            loadNewRound();
        } else if (gameEndOverlay) {
            // Clicking spacebar or tapping removes end overlay and resets game
            gameEndOverlay.remove();
            resetGame();
            loadNewRound();
        } else if (score.correct >= maxrounds || score.wrong >= maxrounds) {
            checkGameEnd(maxrounds);
        } else if (score.correct === maxrounds - 1 && score.wrong === maxrounds - 1) {
            showMakeOrBreakScreen(maxrounds, advanceToNextStep);
        } else {
            loadNewRound();
        }
    } catch (error) {
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
            await fetchWikiExtract(person.wikipediaENurl.split("/").pop(), MAX_CHARACTERS);

            // 3. Delay before enabling interaction (click, swipe, keyboard)
            setTimeout(() => {
                addOverlayListeners();
            }, lockduration);

        }
        catch (error) {
            console.error("Error showing person overlay:", error);
        }
    }

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
            const namesPair = await showNameButtons();

            // 3. Load and display the portrait image after names are shown
            handlePortraitLoadAndDisplay(correctPerson.imageurl, () => {
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

            const happyFace = '<img src="media/green-smiley.svg" alt="Happy">';
            const sadFace = '<img src="media/red-sadface.svg" alt="Sad">';

            if (selectedName === correctPerson.personLabel) {
                score.correct++;
                resultBanner.innerHTML = `${happyFace} <span>Spot on! This is ${correctPerson.personLabel}.</span>`;
                wasCorrect = true;
            }
            else {
                score.wrong++;
                resultBanner.innerHTML = `${sadFace} <span>Oh, no! This is not ${incorrectPerson.personLabel}, it is ${correctPerson.personLabel}.</span>`;
            }

            // Show result banner
            resultBanner.style.display = "flex";
            showAndUpdateScoreBoard(score, MAX_ROUNDS);
            clearNameButtons();

            // Show overlay with Wikipedia info and next-step interactions
            showPersonOverlay(correctPerson, wasCorrect);

            // ✅ Check if the game has ended (after all rounds played)
            checkGameEnd(MAX_ROUNDS);

        }
        catch (error) {
            console.error("Error handling round result:", error);
        }
    }


function checkGameEnd(maxrounds = MAX_ROUNDS) {
    if (score.correct >= maxrounds) {
        renderGameEndOverlay(true); // User won
        if (score.wrong === 0) {
            showCleanStrikeScreen(maxrounds, advanceToNextStep); // Only if perfect score
        }
        attachPlayAgainButton(document.getElementById("game-end-overlay"), resetGame, loadNewRound);
    } else if (score.wrong >= maxrounds) {
        renderGameEndOverlay(false); // User lost
        attachPlayAgainButton(document.getElementById("game-end-overlay"), resetGame, loadNewRound);
    }
}



function resetGame() {
    score.correct = 0;
    score.wrong = 0;
    usedPairs = new Set();
    showAndUpdateScoreBoard(score, MAX_ROUNDS);
    clearOverlay();
    clearResultBanner();
    clearNameButtons();
    portraitElement.style.backgroundImage = "none";
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
            showAndUpdateScoreBoard(score, MAX_ROUNDS);
            loadNewRound();
        }
        catch (error) {
            console.error("Error fetching portraits:", error);
        }
    }


  /**
     * Parses CSV text into an array of person objects.
     * Assumes the CSV format is: namekey;imageurl;person;personLabel;personDescription;wikipediaENurl
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
                        imageurl: parts[1],
                        person: parts[2],
                        personLabel: parts[3],
                        personDescription: capitalizeFirstLetter(parts[4]),
                        wikipediaENurl: parts[5],
                    };
                })
                .filter((entry) => entry !== null);
        }
        catch (error) {
            console.error("Error parsing CSV:", error);
            return [];
        }
    }

    // ================= Main function stuff

    fetchPortraits();
});