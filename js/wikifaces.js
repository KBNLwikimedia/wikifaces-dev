document.addEventListener("DOMContentLoaded", function () {
    const MAX_ROUNDS = 5; // Configurable number of rounds = number of circles in the scoreboard
    const MAX_CHARACTERS = 250;

    // === Global Timeout Configurations - in milliseconds ===
    const NEW_ROUND_FADE_DELAY = 0; // Delay before revealing portrait and buttons
    const FADE_DURATION = 500;            // Interval between showing the portrait ans showing the name buttons

    const IMAGE_LOAD_TIMEOUT = 5000;       // Max wait time before "loadingNotice.textContent = "⏳ Hold on, image still loading...";" is shown
    const IMAGE_ERROR_DISPLAY_DURATION = 1000; // How long the image loading error message is shown (ms)

    const SWIPE_THRESHOLD = 100;           // Minimum swipe distance to trigger next round

    // Not sure if I understand the following constants exactly and correctly
    const SWIPE_INTERACTION_UNLOCK_DELAY = 0; // Delay before interaction unlock after swipe (ms)
    const OVERLAY_CLICK_LOCK_TIME = 0;     // Delay before overlay becomes clickable
    const RESULT_INTERACTION_LOCK = 0;      // Delay before next interaction allowed after result banner is shown (ms)
    const OVERLAY_INTERACTION_DELAY = 0; // How long the overlay stays non-clickable after it's shown (ms)
    const NEXT_ROUND_UNLOCK_TIME = 0;      // Time during which rapid-fire clicks on overlay are disabled

    // Need to better understand the following constants
    const GAME_END_DISPLAY_DELAY = 1600;   // Delay before showing win/loss GIF (ms)
    const GAME_END_COUNTDOWN_START = 5;       // Countdown seconds after game ends and new game begin
    const GAME_END_INTERVAL_DELAY = 1000;  // Countdown tick interval (ms)

    let portraits = [];
    let correctPerson = null;
    let incorrectPerson = null;
    let score = { correct: 0, wrong: 0 };
    let roundPlayed = false;
    let usedNameKeys = new Set();
    let usedPairs = new Set();
    let interactionLocked = false;
    let nextRoundLocked = false;


    const portraitElement = document.getElementById("portrait");
    const nameOptions = document.getElementById("buttons");
    const resultMessage = document.getElementById("result-message");
    const wikiInfo = document.getElementById("wiki-info");
    const gameContainer = document.getElementById("game-container");
    const scoreBoard = document.getElementById("score-board");
    const messageButtonContainer = document.getElementById("message-button-container");


    /**
     * Capitalizes the first letter of a given text string.
     * @param {string} text - Input string.
     * @returns {string} Text with first letter capitalized.
     */
    function capitalizeFirstLetter(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    /**
     * Unlocks interaction and hides the spinner.
     */
    function unlockInteraction() {
        interactionLocked = false;
    }

    /**
     * Resets the overlay and result message area before a new round starts.
     */
    function resetOverlayState() {
        resultMessage.textContent = "";
        resultMessage.style.display = "none";
        wikiInfo.innerHTML = "";
        wikiInfo.style.display = "none";

        const oldOverlay = document.querySelector(".overlay");
        if (oldOverlay) {
            oldOverlay.style.pointerEvents = "auto";
            oldOverlay.style.touchAction = "auto";
        }
    }

    /**
     * Loads a portrait image and ensures a timeout fallback to prevent freezing.
     * @param {string} src - Image source URL.
     * @param {function} onLoad - Callback once loaded.
     */
    function preloadPortraitImage(src, onLoad) {
        const img = new Image();
        img.src = src;

        const timeout = setTimeout(() => {
            console.warn("Image load timeout");
            showImageLoadingNotice();
            unlockInteraction();
        }, IMAGE_LOAD_TIMEOUT);

        img.onload = () => {
            clearTimeout(timeout);
            removeImageLoadingNotice();
            onLoad();
        };

        img.onerror = () => {
            clearTimeout(timeout);
            console.error("Image failed to load:", src);
            showImageLoadError();
            unlockInteraction();
        };
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


    /**
     * Parses CSV text into an array of person objects.
     * Assumes the CSV format is: namekey;image;depicts;name;description;wikipedia
     * @param {string} text - CSV text content.
     * @returns {Array<Object>} Parsed entries with structured fields.
     */
    function parseCSV(text) {
        const lines = text.split("\n").slice(1);
        return lines.map(line => {
            const parts = line.split(";");
            if (parts.length >= 6) {
                return {
                    namekey: parts[0].trim(),
                    image: parts[1].trim(),
                    depicts: parts[2].trim(),
                    name: parts[3].trim(),
                    description: capitalizeFirstLetter(parts[4].trim()),
                    wikipedia: parts[5].trim()
                };
            }
        }).filter(entry => entry);
    }

    /**
     * Ensures a unique pair (not shown before) is selected from name group.
     * @param {Array} nameGroup - People with the same name.
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
     * Returns two randomly selected but distinct people from a group.
     * @param {Array} group - List of people with same name.
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
            button.addEventListener("click", handleSelection);
            nameWrapper.appendChild(button);

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
     * Displays the loaded portrait image with a fade-in effect.
     * @param {function} callback - Function to call after image is shown.
     */
    function showPortraitImage(callback) {
        const spinner = document.getElementById("portrait-spinner");
        if (spinner) spinner.style.display = "none";  // 👈 Only hide now

        portraitElement.style.backgroundImage = `url(${correctPerson.image})`;
        portraitElement.classList.add("fade-in");

        setTimeout(() => {
            portraitElement.classList.remove("fade-in");
            if (typeof callback === 'function') callback();
        }, FADE_DURATION);
    }

    /**
     * Attaches click behavior to the overlay for moving to the next round.
     * Called immediately after injecting overlay into the DOM.
     */
    function attachOverlayClickHandler() {
      const overlay = document.getElementById("overlay");
      if (!overlay) return;

      overlay.style.pointerEvents = "none";
      overlay.style.touchAction = "none";
      nextRoundLocked = true;

      setTimeout(() => {
        overlay.style.pointerEvents = "auto";
        overlay.style.touchAction = "auto";
        nextRoundLocked = false;
      }, NEXT_ROUND_UNLOCK_TIME);

      overlay.addEventListener("click", () => {
        if (roundPlayed && !nextRoundLocked) {
          loadNewRound();
          wikiInfo.innerHTML = "";
          wikiInfo.style.display = "none";
        }
      });
    }


    /**
     * Adds swipe listeners to allow navigating to the next round.
     */
     function addSwipeListeners() {
      let touchStartY = 0;
      let touchEndY = 0;

      const overlay = document.getElementById("overlay");

      function handleTouchStart(event) {
        touchStartY = event.changedTouches[0].screenY;
      }

      function handleTouchEnd(event) {
        touchEndY = event.changedTouches[0].screenY;

        if (
          touchStartY - touchEndY > SWIPE_THRESHOLD &&
          roundPlayed &&
          !interactionLocked &&
          !nextRoundLocked
        ) {
          nextRoundLocked = true;

          loadNewRound();
          wikiInfo.innerHTML = "";
          wikiInfo.style.display = "none";

          // Unlock next round after transition
          setTimeout(() => {
            nextRoundLocked = false;
          }, NEXT_ROUND_UNLOCK_TIME);
        }
      }

      if (overlay) {
        overlay.addEventListener("touchstart", handleTouchStart, { once: true });
        overlay.addEventListener("touchend", handleTouchEnd, { once: true });
      }

      if (portraitElement) {
        portraitElement.addEventListener("touchstart", handleTouchStart, { once: true });
        portraitElement.addEventListener("touchend", handleTouchEnd, { once: true });
      }
    }


    /**
     * Renders the initial overlay with person description and placeholder extract.
     */
    function renderInitialOverlay(name, wikipediaURL, wasCorrect) {
      wikiInfo.innerHTML = `
        <div class="overlay ${wasCorrect ? 'overlay-correct' : 'overlay-wrong'}" id="overlay">
          <p class="description">${correctPerson.description}</p>
          <h2>${name}</h2>
          <p id="wiki-extract">Loading Wikipedia summary...</p>
          <a href="${wikipediaURL}" target="_blank" class="wikipedia-link">Read more on Wikipedia &rarr;</a>
        </div>
      `;
      wikiInfo.style.display = "block";

      addSwipeListeners();
      attachOverlayClickHandler();
    }


    /**
    * Loads a new game round by selecting a unique pair of people,
    * updating the UI and safely handling image transitions.
    */
    function loadNewRound() {
        if (interactionLocked || portraits.length < 2) return;
        interactionLocked = true;
        roundPlayed = false;

        const uniqueNameKeys = [...new Set(portraits.map(p => p.namekey))];
        let selectedNameKey, nameGroup;

        do {
            selectedNameKey = uniqueNameKeys[Math.floor(Math.random() * uniqueNameKeys.length)];
        } while (usedNameKeys.has(selectedNameKey));

        usedNameKeys.add(selectedNameKey);
        nameGroup = portraits.filter(p => p.namekey === selectedNameKey);
        if (nameGroup.length < 2) return loadNewRound();

        [correctPerson, incorrectPerson] = selectUniquePairFrom(nameGroup);
        const allNames = [correctPerson.name, incorrectPerson.name].sort(() => Math.random() - 0.5);

        resetOverlayState();

        createNameButtons(allNames);
        nameOptions.style.display = "none";

        const spinner = document.getElementById("portrait-spinner");
        if (spinner) spinner.style.display = "block";

        preloadPortraitImage(correctPerson.image, () => {
            portraitElement.classList.add("fade-out");
            nameOptions.classList.add("fade-out");

            setTimeout(() => {
                portraitElement.classList.remove("fade-out");
                nameOptions.classList.remove("fade-out");
                showPortraitImage(() => {
                    nameOptions.style.display = "flex";
                    unlockInteraction();
                });
            }, NEW_ROUND_FADE_DELAY);
        });
    }

    /**
     * Handles the user's name selection.
     * - Compares selected name to the correct answer
     * - Updates score and displays result message
     * - Locks interactions briefly to prevent rapid input
     * - Initiates Wikipedia summary loading
     *
     * @param {Event} event - The click event from the name button
     */
    function handleSelection(event) {
        if (interactionLocked) return;
        interactionLocked = true;
        const selectedName = event.target.textContent;
        roundPlayed = true;

        document.querySelectorAll(".button").forEach(button => {
            button.disabled = true;
        });

        let wasCorrect = false;
        const resultMessage = document.getElementById("result-message");

        let happyFace = '<img src="media/green-smiley.png" alt="Happy">';
        let sadFace = '<img src="media/red-sadface.png" alt="Sad">';

        if (selectedName === correctPerson.name) {
            event.target.style.color = "green";
            score.correct++;
            resultMessage.innerHTML = `${happyFace} <span>Spot on! This was ${correctPerson.name}.</span>`;
            wasCorrect = true;
        } else {
            event.target.style.color = "red";
            score.wrong++;
            resultMessage.innerHTML = `${sadFace} <span>Oh, no! This was not ${incorrectPerson.name}, it was ${correctPerson.name}.</span>`;
        }

        resultMessage.style.display = "flex"; // Show message with flexbox

        updateScoreBoard();
        fetchWikiSummary(correctPerson.name, correctPerson.wikipedia, wasCorrect);

        setTimeout(() => {
            interactionLocked = false;
        }, RESULT_INTERACTION_LOCK); // unlock after overlay is ready
    }

    /**
     * Updates the visual scoreboard with correct/wrong counts and circles.
     */
    function updateScoreBoard() {
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

    function checkGameEnd() {
        let gifURL = "";
        let messageText = "";
        if (score.correct >= MAX_ROUNDS) {
            gifURL = "https://i.pinimg.com/originals/ee/42/d9/ee42d91ece376e6847f6941b72269c76.gif";
            messageText = "🎉 You won the game! 🎉";
        } else if (score.wrong >= MAX_ROUNDS) {
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
                        loadNewRound();
                        wikiInfo.innerHTML = "";
                        wikiInfo.style.display = "none";
                    } else {
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
        updateScoreBoard();
    }

    /**
     * Fetches and displays the Wikipedia summary for a person.
     * @param {string} name - The person's name.
     * @param {string} wikipediaURL - URL to the Wikipedia page.
     * @param {boolean} wasCorrect - Whether the guess was correct.
    */
    function fetchWikiSummary(name, wikipediaURL, wasCorrect) {
      try {
        const wikiTitle = wikipediaURL.split("/").pop();
        nameOptions.style.display = "none";

        renderInitialOverlay(name, wikipediaURL, wasCorrect);

        const overlay = document.querySelector(".overlay");
        if (overlay) {
          overlay.style.pointerEvents = "none";
          overlay.style.touchAction = "none";

          // Always re-enable after 2s
          setTimeout(() => {
            overlay.style.pointerEvents = "auto";
            overlay.style.touchAction = "auto";
          }, OVERLAY_INTERACTION_DELAY);
        }

          fetchWikiExtract(wikiTitle);
      } catch (error) {
        console.error("Error fetching Wikipedia summary:", error);

        // 🛡️ Fallback unlock
        const overlay = document.querySelector(".overlay");
        if (overlay) {
          overlay.style.pointerEvents = "auto";
          overlay.style.touchAction = "auto";
        }

        unlockInteraction();
      }
    }


    /**
     * Fetches the Wikipedia summary content and updates the overlay.
     * @param {string} wikiTitle - Wikipedia page title.
     */
    function fetchWikiExtract(wikiTitle) {
        fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`)
            .then(response => response.json())
            .then(data => {
                let extract = data.extract || "Sorry, there is no intro available from Wikipedia.";

                if (extract.length > MAX_CHARACTERS) {
                    extract = extract.substring(0, MAX_CHARACTERS) + "...";
                }

                const extractElement = document.getElementById("wiki-extract");
                if (extractElement) {
                    extractElement.textContent = extract;
                    extractElement.style.color = "#fff";
                    extractElement.style.fontStyle = "normal";
                }

                setTimeout(checkGameEnd, 0);
            })
            .catch(error => {
                const extractElement = document.getElementById("wiki-extract");
                if (extractElement) {
                    extractElement.textContent = "Sorry, I could not load intro from Wikipedia.";
                }
                setTimeout(checkGameEnd, 0);
            });
    }

    /**
     * Asynchronously fetches the CSV data for portraits,
     * parses it, updates the scoreboard, and starts a new round.
     */
    async function fetchPortraits() {
        try {
            const response = await fetch("data/wikifaces-datacache2.csv");
            const text = await response.text();
            portraits = parseCSV(text);
            updateScoreBoard();
            loadNewRound();
        } catch (error) {
            console.error("Error fetching portraits:", error);
        }
    }


// Main function stuff
    gameContainer.addEventListener("touchend", (event) => {
        if (!event.target.closest("a") && roundPlayed) {
            loadNewRound();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.code === "Space" && roundPlayed) {
            loadNewRound();
        }
    });

    fetchPortraits();
});