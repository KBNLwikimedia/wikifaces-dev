document.addEventListener("DOMContentLoaded", function () {
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
    const footer = document.getElementById("footer");
    const logo = document.getElementById("logo");

    async function fetchPortraits() {
        try {
            const response = await fetch("data/portraits.csv");
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
        scoreBoard.textContent = `Score: ✅ ${score.correct} - ❌ ${score.wrong}`;
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

        if (selectedName === correctPerson.name) {
            event.target.style.color = "green";
            score.correct++;
        } else {
            event.target.style.color = "red";
            score.wrong++;
        }

        updateScoreBoard();
        fetchWikiSummary(correctPerson.name, correctPerson.wikipedia);
    }

    async function fetchWikiSummary(name, wikipediaURL) {
        try {
            const wikiTitle = wikipediaURL.split("/").pop();
            const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`);
            const data = await response.json();

            wikiInfo.innerHTML = `
                <div class="overlay">
                    <p>${correctPerson.description}</p>
                    <h3>${data.title}</h3>
                    <p>${data.extract}</p>
                    <a href="${wikipediaURL}" target="_blank" onclick="event.stopPropagation();">Read more on Wikipedia</a>
                </div>
            `;
            wikiInfo.style.display = "block";
        } catch (error) {
            wikiInfo.innerHTML = `<div class="overlay"><p>${correctPerson.description}</p><p>Could not load Wikipedia info.</p></div>`;
            wikiInfo.style.display = "block";
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
