const dotsContainer = document.getElementById("dots");
const enemyNumber = document.getElementById("enemyNumber");

let enemyCount = 8;

function generateDots(count) {
  dotsContainer.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("div");
    dot.classList.add("dot");
    dot.style.left = Math.random() * 95 + "%";
    dot.style.top = Math.random() * 90 + "%";
    dotsContainer.appendChild(dot);
  }
}

function updateEnemies(count) {
  enemyCount = count;
  enemyNumber.textContent = count.toString().padStart(2, "0");
  generateDots(count);
}

// Initial load
generateDots(enemyCount);
