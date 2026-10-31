const MONSTERS = [
  "スライム", "モーモン", "プリズニャン", "ホイミスライム", "スライムナイト",
  "キメラ", "ねこまどう", "リザードマン", "バトルレックス", "いたずらもぐら",
  "ベビーサタン", "ドラゴンキッズ", "ドラキー", "ブラウニー", "キラーパンサー",
  "メタッピー", "たけやりへい", "ニードルマン", "フォンデュ", "エンタシスマン",
  "さまようよろい", "ゴーレム", "デビルアーマー", "おどるほうせき", "マジカルハット",
  "パペットマン", "キラーマシン", "やみしばり", "たんすミミック", "ミステリドール"
];

const STORAGE_KEY = "dq10-skill-planner:v1";
const elements = {
  catalog: document.querySelector("#catalog-list"),
  catalogCount: document.querySelector("#catalog-count"),
  search: document.querySelector("#monster-search"),
  cards: document.querySelector("#monster-cards"),
  summary: document.querySelector("#party-summary"),
  empty: document.querySelector("#empty-state"),
  bulkPoints: document.querySelector("#bulk-points"),
  shareButton: document.querySelector("#share-button"),
  clearButton: document.querySelector("#clear-button"),
  clearDialog: document.querySelector("#clear-dialog"),
  toast: document.querySelector("#toast")
};

let toastTimeout;
let state = loadState();

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isValidPlan(value) {
  return value
    && typeof value === "object"
    && Number.isSafeInteger(value.pointsAvailable)
    && value.pointsAvailable >= 0
    && value.pointsAvailable <= 9999
    && Array.isArray(value.monsters)
    && value.monsters.length <= 100
    && value.monsters.every((monster) => (
      monster
      && typeof monster.id === "string"
      && monster.id.length <= 100
      && typeof monster.name === "string"
      && monster.name.length <= 40
      && Number.isSafeInteger(monster.pointsAvailable)
      && monster.pointsAvailable >= 0
      && monster.pointsAvailable <= 9999
      && Array.isArray(monster.lines)
      && monster.lines.length <= 50
      && monster.lines.every((line) => (
        line
        && typeof line.name === "string"
        && line.name.length <= 40
        && Number.isSafeInteger(line.points)
        && line.points >= 0
        && line.points <= 9999
      ))
    ));
}

function decodeSharedPlan() {
  const encoded = new URLSearchParams(location.search).get("plan");
  if (!encoded) return null;

  try {
    const bytes = Uint8Array.from(
      atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
      (character) => character.charCodeAt(0)
    );
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!isValidPlan(parsed)) throw new Error("共有データの形式が正しくありません。");
    return parsed;
  } catch (error) {
    console.error("共有プランを読み込めませんでした。", error);
    showToast("共有リンクを読み込めませんでした。リンクが壊れていないか確認してください。");
    return null;
  }
}

function loadState() {
  const sharedPlan = decodeSharedPlan();
  if (sharedPlan) return sharedPlan;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { pointsAvailable: 100, monsters: [] };
    const parsed = JSON.parse(saved);
    if (!isValidPlan(parsed)) throw new Error("保存データの形式が正しくありません。");
    return parsed;
  } catch (error) {
    console.error("保存済みプランを読み込めませんでした。", error);
    return { pointsAvailable: 100, monsters: [] };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("プランを保存できませんでした。", error);
    showToast("ブラウザーへの保存に失敗しました。空き容量や設定を確認してください。");
  }
}

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeButton(label, className, action, title = label) {
  const button = makeElement("button", className, label);
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("click", action);
  return button;
}

function renderCatalog() {
  const query = elements.search.value.trim().toLocaleLowerCase("ja");
  const filtered = MONSTERS.filter((name) => name.toLocaleLowerCase("ja").includes(query));
  elements.catalog.replaceChildren();
  elements.catalogCount.textContent = String(filtered.length);

  if (filtered.length === 0) {
    elements.catalog.append(makeElement("p", "catalog-no-results", "該当するモンスターがいません"));
    return;
  }

  for (const name of filtered) {
    const button = makeElement("button", "catalog-item");
    button.type = "button";
    button.setAttribute("aria-label", `${name}を編成に追加`);
    const icon = makeElement("span", "catalog-item-icon", name.slice(0, 1));
    icon.setAttribute("aria-hidden", "true");
    const label = makeElement("span", "catalog-item-name", name);
    const add = makeElement("span", "catalog-item-add", "+");
    add.setAttribute("aria-hidden", "true");
    button.append(icon, label, add);
    button.addEventListener("click", () => addMonster(name));
    elements.catalog.append(button);
  }
}

function addMonster(name) {
  state.monsters.push({
    id: createId(),
    name,
    pointsAvailable: state.pointsAvailable,
    lines: [
      { name: "スキルライン 1", points: 0 },
      { name: "スキルライン 2", points: 0 }
    ],
    collapsed: false
  });
  saveAndRender();
  showToast(`${name}を編成に追加しました`);
}

function getAllocatedPoints(monster) {
  return monster.lines.reduce((total, line) => total + Math.max(0, line.points), 0);
}

function renderSummary() {
  const count = state.monsters.length;
  const allocated = state.monsters.reduce((total, monster) => total + getAllocatedPoints(monster), 0);
  const available = state.monsters.reduce((total, monster) => total + monster.pointsAvailable, 0);

  elements.summary.replaceChildren();
  const label = makeElement("span", "", "編成");
  const monsterCount = makeElement("strong", "", `${count}体`);
  const separator = makeElement("span", "summary-separator", "·");
  const pointLabel = makeElement("span", "", "配分ポイント");
  const points = makeElement("strong", "", `${allocated} / ${available} pt`);
  elements.summary.append(label, monsterCount, separator, pointLabel, points);
}

function makePointsStepper(monster, line, index) {
  const stepper = makeElement("div", "stepper");
  const decrement = makeButton("−", "", () => updateLinePoints(monster.id, index, line.points - 1), "1ポイント減らす");
  const input = makeElement("input", "points-input");
  input.type = "number";
  input.min = "0";
  input.max = "9999";
  input.step = "1";
  input.value = String(line.points);
  input.setAttribute("aria-label", `${line.name}の配分ポイント`);
  input.addEventListener("change", () => updateLinePoints(monster.id, index, Number(input.value)));
  const increment = makeButton("+", "", () => updateLinePoints(monster.id, index, line.points + 1), "1ポイント増やす");
  stepper.append(decrement, input, increment);
  return stepper;
}

function renderSkillLine(monster, line, index) {
  const row = makeElement("div", "skill-line");
  const nameInput = makeElement("input", "line-name");
  nameInput.type = "text";
  nameInput.maxLength = 40;
  nameInput.value = line.name;
  nameInput.setAttribute("aria-label", "スキルライン名");
  nameInput.addEventListener("input", () => {
    line.name = nameInput.value;
    saveState();
  });
  row.append(nameInput, makePointsStepper(monster, line, index));
  row.append(makeButton("×", "line-remove", () => {
    monster.lines.splice(index, 1);
    saveAndRender();
  }, `${line.name}を削除`));
  return row;
}

function renderMonster(monster, index) {
  const card = makeElement("article", `monster-card${monster.collapsed ? " card-collapsed" : ""}`);
  const header = makeElement("header", "card-header");
  const titleWrap = makeElement("div", "card-title-wrap");
  const avatar = makeElement("span", "monster-avatar", monster.name.slice(0, 1));
  avatar.setAttribute("aria-hidden", "true");
  const titleArea = makeElement("div", "");
  const nameInput = makeElement("input", "monster-name");
  nameInput.type = "text";
  nameInput.maxLength = 40;
  nameInput.value = monster.name;
  nameInput.setAttribute("aria-label", "モンスター名");
  nameInput.addEventListener("input", () => {
    monster.name = nameInput.value;
    avatar.textContent = nameInput.value.slice(0, 1);
    saveState();
  });
  titleArea.append(nameInput, makeElement("span", "card-subtitle", "スキル配分プラン"));
  titleWrap.append(avatar, titleArea);

  const tools = makeElement("div", "card-tools");
  tools.append(
    makeButton("↑", "icon-button", () => moveMonster(index, -1), "上に移動"),
    makeButton("↓", "icon-button", () => moveMonster(index, 1), "下に移動"),
    makeButton(monster.collapsed ? "⌄" : "⌃", "icon-button", () => {
      monster.collapsed = !monster.collapsed;
      saveAndRender();
    }, monster.collapsed ? "展開" : "折りたたむ"),
    makeButton("×", "icon-button remove", () => {
      state.monsters.splice(index, 1);
      saveAndRender();
      showToast("編成から削除しました");
    }, "編成から削除")
  );
  header.append(titleWrap, tools);
  card.append(header);

  if (monster.collapsed) return card;

  const body = makeElement("div", "card-body");
  const settings = makeElement("div", "card-settings");
  const budgetLabel = makeElement("label", "setting-label");
  budgetLabel.append(makeElement("span", "", "使用可能ポイント"));
  const budgetWrap = makeElement("span", "setting-input-wrap");
  const budgetInput = makeElement("input", "setting-input");
  budgetInput.type = "number";
  budgetInput.min = "0";
  budgetInput.max = "9999";
  budgetInput.step = "1";
  budgetInput.value = String(monster.pointsAvailable);
  budgetInput.setAttribute("aria-label", `${monster.name}の使用可能ポイント`);
  budgetInput.addEventListener("change", () => {
    const next = Math.max(0, Math.min(9999, Math.floor(Number(budgetInput.value) || 0)));
    monster.pointsAvailable = next;
    saveAndRender();
  });
  budgetWrap.append(budgetInput, makeElement("span", "setting-unit", "pt"));
  budgetLabel.append(budgetWrap);

  const allocated = getAllocatedPoints(monster);
  const remaining = monster.pointsAvailable - allocated;
  const statusClass = remaining < 0 ? "over" : remaining > 0 ? "unused" : "";
  const status = makeElement(
    "span",
    `budget-status ${statusClass}`.trim(),
    remaining < 0 ? `${Math.abs(remaining)} pt超過` : remaining > 0 ? `残り ${remaining} pt` : "ぴったり"
  );
  settings.append(budgetLabel, status);
  body.append(settings);

  const lines = makeElement("div", "skill-lines");
  monster.lines.forEach((line, lineIndex) => lines.append(renderSkillLine(monster, line, lineIndex)));
  const addLine = makeButton("+ スキルラインを追加", "add-line", () => {
    monster.lines.push({ name: `スキルライン ${monster.lines.length + 1}`, points: 0 });
    saveAndRender();
  });
  lines.append(addLine);
  body.append(lines);
  card.append(body);
  return card;
}

function render() {
  renderCatalog();
  elements.cards.replaceChildren();
  state.monsters.forEach((monster, index) => elements.cards.append(renderMonster(monster, index)));
  elements.empty.hidden = state.monsters.length > 0;
  elements.bulkPoints.value = String(state.pointsAvailable);
  renderSummary();
}

function saveAndRender() {
  saveState();
  render();
}

function updateLinePoints(monsterId, lineIndex, points) {
  const monster = state.monsters.find((entry) => entry.id === monsterId);
  if (!monster || !monster.lines[lineIndex]) return;
  monster.lines[lineIndex].points = Math.max(0, Math.min(9999, Math.floor(Number(points) || 0)));
  saveAndRender();
}

function moveMonster(index, direction) {
  const next = index + direction;
  if (next < 0 || next >= state.monsters.length) return;
  [state.monsters[index], state.monsters[next]] = [state.monsters[next], state.monsters[index]];
  saveAndRender();
}

function encodePlan() {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function copyShareLink() {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("plan", encodePlan());
  try {
    await navigator.clipboard.writeText(url.toString());
    showToast("共有リンクをコピーしました");
  } catch (error) {
    console.error("共有リンクをコピーできませんでした。", error);
    showToast("コピーできませんでした。ブラウザーのクリップボード権限を確認してください。");
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

elements.search.addEventListener("input", renderCatalog);
elements.bulkPoints.addEventListener("change", () => {
  state.pointsAvailable = Math.max(0, Math.min(9999, Number(elements.bulkPoints.value) || 0));
  state.monsters.forEach((monster) => { monster.pointsAvailable = state.pointsAvailable; });
  saveAndRender();
});
elements.shareButton.addEventListener("click", copyShareLink);
elements.clearButton.addEventListener("click", () => {
  if (typeof elements.clearDialog.showModal === "function") elements.clearDialog.showModal();
  else if (window.confirm("編成をすべて削除しますか？")) clearPlan();
});
document.querySelector("#confirm-clear").addEventListener("click", (event) => {
  event.preventDefault();
  elements.clearDialog.close("confirm");
  clearPlan();
});
elements.clearDialog.addEventListener("click", (event) => {
  if (event.target === elements.clearDialog) elements.clearDialog.close("cancel");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
    event.preventDefault();
    elements.search.focus();
  }
});

function clearPlan() {
  state.monsters = [];
  saveAndRender();
  showToast("編成を削除しました");
}

render();
