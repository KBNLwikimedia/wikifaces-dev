document.addEventListener("DOMContentLoaded", function () {
    const MAX_ROUNDS = 5; // Configurable number of rounds
    let portraits = [];
    let correctPerson = null;
    let incorrectPerson = null;
    let score = { correct: 0, wrong: 0 };
    let roundPlayed = false;
    let usedNameKeys = new Set();
    let usedPairs = new Set();

    const portraitElement = document.getElementById("portrait");
    const nameOptions = document.getElementById("buttons");
    const resultMessage = document.getElementById("result-message");
    const wikiInfo = document.getElementById("wiki-info");
    const gameContainer = document.getElementById("game-container");
    const scoreBoard = document.getElementById("score-board");
    const messageButtonContainer = document.getElementById("message-button-container");

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

    function capitalizeFirstLetter(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function updateScoreBoard() {
        scoreBoard.innerHTML = "";
        const correctRow = document.createElement("div");
        const wrongRow = document.createElement("div");
        correctRow.classList.add("score-row");
        wrongRow.classList.add("score-row");

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

    // Whether th user selected the correct name or not
    function handleSelection(event) {
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
    }

function fetchWikiSummary(name, wikipediaURL, wasCorrect) {
    try {
        const wikiTitle = wikipediaURL.split("/").pop();
        nameOptions.style.display = "none";
        renderInitialOverlay(name, wikipediaURL, wasCorrect);
        addSwipeListeners();
        fetchWikiExtract(wikiTitle);

    } catch (error) {
        console.error("Error fetching Wikipedia summary:", error);
    }
}

function showPortraitLoadingSpinner(callback) {
    const spinner = document.getElementById("portrait-spinner");
    if (spinner) spinner.style.display = "block";

    const img = new Image();
    img.src = correctPerson.image;
    img.onload = () => {
        setTimeout(() => { // Wait for fade-out to complete
            portraitElement.style.backgroundImage = `url(${correctPerson.image})`;
            if (spinner) spinner.style.display = "none";
            if (typeof callback === 'function') callback();
        }, 500); // Match the CSS transition duration
    };
}


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
}

function addSwipeListeners() {
    let touchStartY = 0;
    let touchEndY = 0;

    function handleTouchStart(event) {
        touchStartY = event.changedTouches[0].screenY;
    }

    function handleTouchEnd(event) {
        touchEndY = event.changedTouches[0].screenY;
        if (touchStartY - touchEndY > 50 && roundPlayed) {
            loadNewRound();
            wikiInfo.innerHTML = "";
            wikiInfo.style.display = "none";
        }
    }

    const overlayElement = document.getElementById("overlay");
    if (overlayElement) {
        overlayElement.addEventListener("touchstart", handleTouchStart);
        overlayElement.addEventListener("touchend", handleTouchEnd);
    }
    if (portraitElement) {
        portraitElement.addEventListener("touchstart", handleTouchStart);
        portraitElement.addEventListener("touchend", handleTouchEnd);
    }
}


function fetchWikiExtract(wikiTitle) {
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`)
        .then(response => response.json())
        .then(data => {
            let extract = data.extract || "Sorry, there is no intro available from Wikipedia.";
            const MAX_CHARACTERS = 250;

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


function getTwoDistinctPeople(group) {
    if (group.length < 2) return [null, null];

    let firstIndex = Math.floor(Math.random() * group.length);
    let secondIndex;
    do {
        secondIndex = Math.floor(Math.random() * group.length);
    } while (secondIndex === firstIndex);

    return [group[firstIndex], group[secondIndex]];
}

function selectUniquePairFrom(nameGroup) {
    let pair, pairKey;
    do {
        pair = getTwoDistinctPeople(nameGroup);
        pairKey = [pair[0].depicts, pair[1].depicts].sort().join("|");
    } while (usedPairs.has(pairKey));

    usedPairs.add(pairKey);
    return pair;
}

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


function preloadPortraitImage(src, onLoad) {
    const img = new Image();
    img.src = src;
    img.onload = () => onLoad();
}

function showPortraitImage(callback) {
    const spinner = document.getElementById("portrait-spinner");
    if (spinner) spinner.style.display = "none";

    portraitElement.style.backgroundImage = `url(${correctPerson.image})`;
    portraitElement.classList.add("fade-in");
    setTimeout(() => {
        portraitElement.classList.remove("fade-in");
        if (typeof callback === 'function') callback();
    }, 500);
}

function loadNewRound() {
    if (portraits.length < 2) return;
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

    resultMessage.textContent = "";
    wikiInfo.innerHTML = "";
    wikiInfo.style.display = "none";
    document.getElementById("result-message").style.display = "none";

    const oldOverlay = document.querySelector(".overlay");
    if (oldOverlay) {
        oldOverlay.style.pointerEvents = "auto";
        oldOverlay.style.touchAction = "auto";
    }

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
            });
        }, 500);
    });
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
            let countdown = 5;
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
            }, 0);

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
        }, 1600); // Delay before showing end screen
    }
}

function resetGame() {
    score.correct = 0;
    score.wrong = 0;
    updateScoreBoard();
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