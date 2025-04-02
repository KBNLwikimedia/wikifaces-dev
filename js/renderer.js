/**
 * Renderer module to handle UI construction and updates
 * for overlays, banners, and notices in the game.
 */

const happyFace = '<img src="media/green-smiley.svg" alt="Happy">';
const sadFace = '<img src="media/red-sadface.svg" alt="Sad">';

/**
 * Capitalizes the first letter of a given string.
 * Returns the original input if it's not a string or is empty.
 *
 * @param {string} text - Input string.
 * @returns {string} The input string with its first letter capitalized.
 */


export function capitalizeFirstLetter(text) {
    try {
        if (typeof text !== "string" || text.length === 0) {
            console.warn("⚠️ capitalizeFirstLetter received invalid input:", text);
            return text;
        }

        return text.charAt(0).toUpperCase() + text.slice(1);
    }
    catch (error) {
        console.error("❌ Error in capitalizeFirstLetter:", error);
        return text;
    }
}

/**
 * Displays a visual notice informing the user that the portrait image is still loading.
 * Intended to appear after a loading delay to reassure users during slower connections.
 */
export function showImageLoadingNotice() {
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
export function clearImageLoadingNotice() {
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
export function showImageLoadError(duration = IMAGE_ERROR_DISPLAY_DURATION) {
    try {
        const errorMessage = document.createElement("div");
        errorMessage.textContent = "⚠️ Sorry, the image failed to load. You might want to reload the app and try again!";
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

/**
 * Displays a temporary on-screen notice while selecting two random people.
 * Typically used when the name selection process takes longer than expected.
 */
export function showNameSelectionNotice() {
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
export function clearNameSelectionNotice() {
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
 * Creates and displays name selection buttons inside the pre-defined .button-wrapper container.
 * Adds click listeners to each button and includes an "OR" divider between two names.
 *
  * @param {Array<string>} namesPair - Array of two names to show.
 * @param {Function} onClickHandler - Function to handle button clicks.
 */
export function createNameButtons(namesPair, onClickHandler) {
    try {
        const nameOptions = document.getElementById("buttons");
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
        firstButton.addEventListener("click", onClickHandler);
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
        secondButton.addEventListener("click", onClickHandler);
        nameOptions.appendChild(secondButton);

    }
    catch (error) {
        console.error("Failed to create name buttons:", error);
    }
}

/**
 * Hides and clears the name buttons area.
 * Ensures no lingering content or active display remains.
 */
export function clearNameButtons() {
    try {
        const nameOptions = document.getElementById("buttons");
        nameOptions.innerHTML = "";
        nameOptions.style.display = "none";
    }
    catch (error) {
        console.error("Failed to clear name buttons:", error);
    }
}

/**
 * Constructs and displays the overlay containing person details and a placeholder for the Wikipedia summary.
 *
 * @param {Object} person - The person to display (should have `name`, `description`, and `wikipedia` fields).
 * @param {boolean} wasCorrect - Whether the guess was correct (controls overlay styling).
 */
export function createOverlayHTML(person, wasCorrect) {
    try {
        const wikiInfo = document.getElementById("wiki-info");
        if (!wikiInfo || !person || !person.personLabel || !person.wikipediaENurl) {
            throw new Error("Invalid person object passed to createOverlayHTML");
        }

        const description = person.personDescription && person.personDescription.trim() ?
            `<p class="description">${person.personDescription}</p>` :
            "";

        wikiInfo.innerHTML = `
            <div class="overlay ${wasCorrect ? 'overlay-correct' : 'overlay-wrong'}" id="overlay">
                ${description}
                <h2>${person.personLabel}</h2>
                <p id="wiki-extract"></p>
                <a href="${person.wikipediaENurl}" target="_blank" class="wikipedia-link">Read more on Wikipedia &rarr;</a>
            </div>
        `;

        wikiInfo.style.display = "block";
    }
    catch (error) {
        console.error("❌ Failed to create overlay HTML:", error);
    }
}

/**
 * Hides and clears the overlay (Wikipedia information area).
 * Used before rendering a new overlay or when exiting a round.
 */
export function clearOverlay() {
    try {
        const wikiInfo = document.getElementById("wiki-info");
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
export function clearResultBanner() {
    try {
        const resultBanner = document.getElementById("result-banner");
        resultBanner.innerHTML = "";
        resultBanner.style.display = "none";
    }
    catch (error) {
        console.error("Failed to clear result banner:", error);
    }
}

/**
 * Visually updates the scoreboard UI with current correct and wrong answer counts.
 * - Each row shows a numeric label followed by a series of progress circles.
 * - Green = correct answers, Red = incorrect answers.
 * - Filled circles indicate how many have been achieved.
 *
 * @param {Object} score - An object with `correct` and `wrong` counters.
 * @param {number} maxRounds - Total number of rounds to show.
 */
export function showAndUpdateScoreBoard(score, maxRounds) {
    try {
        const scoreBoard = document.getElementById("score-board");
        scoreBoard.innerHTML = "";

        const categories = [
            { count: score.correct, baseColor: "light-green", fillColor: "dark-green" },
            { count: score.wrong, baseColor: "light-red", fillColor: "dark-red" }
        ];

        categories.forEach(({ count, baseColor, fillColor }) => {
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

    } catch (error) {
        console.error("⚠️ Error updating scoreboard:", error);
    }
}

    /**
     * Fetches the Wikipedia summary and updates the overlay extract area.
     * @param {string} wikiTitle - The Wikipedia article title.
     * @returns {Promise<void>}
     */
    export function fetchWikiExtract(wikiTitle, maxLength = 250) {
        const extractElement = document.getElementById("wiki-extract");

        if (extractElement) {
            extractElement.classList.remove("loaded");
            extractElement.textContent = "Loading Wikipedia summary...";
        }

        return fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`)
            .then(response => response.json())
            .then(data => {
                let extract = data.extract || "Sorry, there is no intro available from Wikipedia.";

                if (extract.length > maxLength) {
                    extract = extract.substring(0, maxLength) + "...";
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
     * Displays a temporary "Make or Break" overlay with a dramatic message,
     * then waits for user interaction (click, touch, or key press) to proceed.
     * Calls the global `advanceToNextStep()` when interaction is detected.
     */
   export function showMakeOrBreakScreen(maxrounds, proceedCallback) {
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
            makeOrBreakOverlay.addEventListener("click", proceedCallback, {
                once: true
            });
            makeOrBreakOverlay.addEventListener("touchstart", proceedCallback, {
                once: true
            });
            makeOrBreakOverlay.addEventListener("keydown", (e) => {
                if (["Space", "Enter"].includes(e.code)) {
                    proceedCallback(); // NOT: advanceToNextStep without the parentheses!
                }
            }, {
                once: true
            });

        }
        catch (error) {
            console.error("Error showing Make or Break screen:", error);
        }
    }

    /**
 * Displays a "Clean Strike" overlay when the user gets all answers correct.
 * Waits for user interaction (click, touch, or key press) to proceed.
 * Calls the global `advanceToNextStep()` when interaction is detected.
 */
export function showCleanStrikeScreen(maxrounds,proceedCallback) {
    try {
        const cleanStrikeOverlay = document.createElement("div");

        cleanStrikeOverlay.id = "clean-strike";
        cleanStrikeOverlay.className = "clean-strike-screen";
        cleanStrikeOverlay.innerHTML = `
            <div class="clean-strike-text">${happyFace}</div>
            <div class="clean-strike-text">${maxrounds} - 0 </div>
            <div class="clean-strike-text">💥 Clean Strike!</div>
        `;

        cleanStrikeOverlay.setAttribute("tabindex", "10");
        document.body.appendChild(cleanStrikeOverlay);
        cleanStrikeOverlay.focus();

        // Proceed to next step on interaction
        cleanStrikeOverlay.addEventListener("click", proceedCallback, { once: true });
        cleanStrikeOverlay.addEventListener("touchstart", proceedCallback, { once: true });
        cleanStrikeOverlay.addEventListener("keydown", (e) => {
            if (["Space", "Enter"].includes(e.code)) {
                proceedCallback();
            }
        }, { once: true });

    } catch (error) {
        console.error("Error showing Clean Strike screen:", error);
    }
}


/**
 * Creates and shows the end-of-game overlay with result message and GIF.
 * Disables interaction with the underlying round overlay.
 *
 * @param {boolean} won - Whether the user won or lost.
 */
export function renderGameEndOverlay(won) {
    try {
        const overlay = document.createElement("div");
        overlay.id = "game-end-overlay";
        overlay.className = "game-end-overlay";

        const message = won ? `Yessss! You won the game!` : `Bummer! You lost the game!`;
        const gifURL = won
            ? "https://i.pinimg.com/originals/ee/42/d9/ee42d91ece376e6847f6941b72269c76.gif"
            : "https://i.pinimg.com/originals/0e/46/23/0e4623557c805b3462daed47c2c0d4b6.gif";

        overlay.innerHTML = `
            <div class="game-end-message">${message}</div>
            <img src="${gifURL}" alt="${won ? "Victory" : "Defeat"}">
        `;

        document.body.appendChild(overlay);

        // 🔒 Disable interaction with the underlying overlay
        const baseOverlay = document.getElementById("overlay");
        if (baseOverlay) {
            baseOverlay.style.pointerEvents = "none";
            baseOverlay.setAttribute("tabindex", "-1");
        }

        // Show Play Again button
         // attachPlayAgainButton(overlay);

    } catch (error) {
        console.error("Error showing game end overlay:", error);
    }
}

/**
 * Appends a "Play Again" button to the end-of-game overlay.
 *
 * @param {HTMLElement} overlay - The game-end overlay container.
 * @param {function} resetGameCallback - Function to reset the game.
 * @param {function} loadNewRoundCallback - Function to start a new round.
 */
export function attachPlayAgainButton(overlay, resetGameCallback, loadNewRoundCallback) {
    try {
        const button = document.createElement("button");
        button.textContent = "Play Again";
        button.className = "play-again-button";

        button.addEventListener("click", () => {
            overlay.remove();
            if (typeof resetGameCallback === "function") resetGameCallback();
            if (typeof loadNewRoundCallback === "function") loadNewRoundCallback();
        });

        overlay.appendChild(button);
    } catch (error) {
        console.error("Failed to attach Play Again button:", error);
    }
}



