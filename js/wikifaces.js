document.addEventListener("DOMContentLoaded", function () {
    const MAX_ROUNDS = 2; // Configurable number of rounds
    let portraits = [];
    let correctPerson = null;
    let incorrectPerson = null;
    let score = { correct: 0, wrong: 0 };
    let roundPlayed = false;

    const portraitElement = document.getElementById("portrait");
    const nameOptions = document.getElementById("name-options");
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

   function checkGameEnd() {
        if (score.correct >= MAX_ROUNDS) {
            alert("Well done!");
            resetGame();
        } else if (score.wrong >= MAX_ROUNDS) {
            alert("Donate to Wikipedia");
            resetGame();
        }
    }

    function resetGame() {
        score.correct = 0;
        score.wrong = 0;
        updateScoreBoard();
    }


    function loadNewRound() {
        if (portraits.length < 2) return;
        roundPlayed = false;

        const uniqueNameKeys = [...new Set(portraits.map(p => p.namekey))];
        const selectedNameKey = uniqueNameKeys[Math.floor(Math.random() * uniqueNameKeys.length)];

        const nameGroup = portraits.filter(p => p.namekey === selectedNameKey);
        if (nameGroup.length < 2) {
            loadNewRound();
            return;
        }

        nameGroup.sort(() => Math.random() - 0.5);
        correctPerson = nameGroup[0];
        incorrectPerson = nameGroup[1];

        const allNames = [correctPerson.name, incorrectPerson.name].sort(() => Math.random() - 0.5);

        portraitElement.style.backgroundImage = `url(${correctPerson.image})`;

        nameOptions.innerHTML = "";
        allNames.forEach(name => {
            const button = document.createElement("button");
            button.textContent = name;
            button.classList.add("name-option");
            button.addEventListener("click", handleSelection);
            nameOptions.appendChild(button);
        });

        resultMessage.textContent = "";
        wikiInfo.innerHTML = "";
        wikiInfo.style.display = "none";
    }

function handleSelection(event) {
        const selectedName = event.target.textContent;
        roundPlayed = true;

        document.querySelectorAll(".name-option").forEach(button => {
            button.disabled = true;
        });

        let wasCorrect = false;
        if (selectedName === correctPerson.name) {
            event.target.style.color = "green";
            score.correct++;
            resultMessage.textContent = "✅ You are right!";
            wasCorrect = true;
        } else {
            event.target.style.color = "red";
            score.wrong++;
            resultMessage.textContent = `❌ You were wrong! This was ${correctPerson.name}.`;
        }

        updateScoreBoard();
        fetchWikiSummary(correctPerson.name, correctPerson.wikipedia, wasCorrect);
    }

      function fetchWikiSummary(name, wikipediaURL, wasCorrect) {
        try {
            const wikiTitle = wikipediaURL.split("/").pop();
            fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`)
                .then(response => response.json())
                .then(data => {
                    wikiInfo.innerHTML = `
                        <div class="overlay ${wasCorrect ? 'overlay-correct' : 'overlay-wrong'}">
                            <p>${correctPerson.description}</p>
                            <h3>${data.title}</h3>
                            <p>${data.extract}</p>
                            <a href="${wikipediaURL}" target="_blank" class="wikipedia-link">Read more on Wikipedia</a>
                        </div>
                    `;
                    wikiInfo.style.display = "block";

                    // Delay the game end check to ensure the last circle is updated
                    setTimeout(checkGameEnd, 1200);
                })
                .catch(error => {
                    wikiInfo.innerHTML = `<div class="overlay ${wasCorrect ? 'overlay-correct' : 'overlay-wrong'}"><p>${correctPerson.description}</p><p>Could not load Wikipedia info.</p></div>`;
                    wikiInfo.style.display = "block";

                    setTimeout(checkGameEnd, 1200);
                });
        } catch (error) {
            console.error("Error fetching Wikipedia summary:", error);
        }
    }

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