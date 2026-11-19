const API_BASE = "https://scanty-md-bot.apps.bot-hosting.cloud";

const state = {
  token: sessionStorage.getItem("scanty_admin_token") || "",
  users: [],
  pendingAction: null,
};

const $ = (selector) => document.querySelector(selector);

const loginPage = $("#loginPage");
const dashboard = $("#dashboard");

const loginForm = $("#loginForm");
const passwordInput = $("#adminPassword");
const passwordToggle = $("#passwordToggle");
const loginError = $("#loginError");

const notice = $("#notice");
const backendStatus = $("#backendStatus");

const refreshBtn = $("#refreshBtn");
const logoutBtn = $("#logoutBtn");

const totalUsersEl = $("#totalUsers");
const connectedUsersEl = $("#connectedUsers");
const savedSessionsEl = $("#savedSessions");
const activeNowEl = $("#activeNow");

const usersBody = $("#usersBody");
const searchInput = $("#searchInput");
const statusFilter = $("#statusFilter");

const confirmModal = $("#confirmModal");
const confirmTitle = $("#confirmTitle");
const confirmMessage = $("#confirmMessage");
const cancelActionBtn = $("#cancelAction");
const confirmActionBtn = $("#confirmAction");

let noticeTimer = null;


/* =========================================================
   PAGE STATE
========================================================= */

function showLogin() {
  loginPage.classList.remove("hidden");
  dashboard.classList.add("hidden");

  passwordInput.value = "";

  setTimeout(() => {
    passwordInput.focus();
  }, 50);
}

function showDashboard() {
  loginPage.classList.add("hidden");
  dashboard.classList.remove("hidden");
}


/* =========================================================
   NOTICE
========================================================= */

function setNotice(message, type = "info", timeout = 5000) {
  clearTimeout(noticeTimer);

  notice.textContent = message;
  notice.className = `notice show ${type}`;

  if (timeout > 0) {
    noticeTimer = setTimeout(() => {
      clearNotice();
    }, timeout);
  }
}

function clearNotice() {
  notice.className = "notice";
  notice.textContent = "";
}


/* =========================================================
   BACKEND STATUS
========================================================= */

function setBackendStatus(online) {
  backendStatus.classList.remove("online", "offline");

  if (online) {
    backendStatus.classList.add("online");

    backendStatus.innerHTML = `
      <span class="status-dot"></span>
      Backend Online
    `;
  } else {
    backendStatus.classList.add("offline");

    backendStatus.innerHTML = `
      <span class="status-dot"></span>
      Backend Offline
    `;
  }
}


/* =========================================================
   DATE / TIME
========================================================= */

function formatDate(value) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


/* =========================================================
   USER NORMALIZATION
========================================================= */

function normalizeUser(user) {
  return {
    number:
      user.number ||
      user.phone ||
      user.phoneNumber ||
      user.jid ||
      "",

    status:
      String(
        user.status ||
        user.connection ||
        user.state ||
        "disconnected"
      ).toLowerCase(),

    saved:
      Boolean(
        user.saved ??
        user.sessionSaved ??
        user.hasSession ??
        false
      ),

    lastActivity:
      user.lastActivity ||
      user.lastSeen ||
      user.updatedAt ||
      user.createdAt ||
      null,
  };
}


/* =========================================================
   API REQUEST
========================================================= */

async function api(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  if (
    options.body &&
    typeof options.body !== "string"
  ) {
    headers["Content-Type"] = "application/json";

    options.body = JSON.stringify(options.body);
  }

  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.status === 401) {
    logout(false);

    throw new Error(
      data?.message ||
      data?.error ||
      "Admin session expired."
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      `Request failed with status ${response.status}.`
    );
  }

  return data;
}


/* =========================================================
   LOGIN
========================================================= */

async function login(password) {
  loginError.classList.add("hidden");
  loginError.textContent = "";

  const button = loginForm.querySelector("button[type='submit']");

  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "CHECKING...";

  try {
    const data = await api("/admin/login", {
      method: "POST",
      body: {
        password,
      },
    });

    if (!data || !data.token) {
      throw new Error(
        "Login succeeded but the server did not return an admin token."
      );
    }

    state.token = data.token;

    sessionStorage.setItem(
      "scanty_admin_token",
      state.token
    );

    showDashboard();

    await loadDashboard();
  } catch (error) {
    loginError.textContent =
      error.message ||
      "Unable to sign in.";

    loginError.classList.remove("hidden");

    setBackendStatus(false);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}


/* =========================================================
   LOAD DASHBOARD
========================================================= */

async function loadDashboard() {
  setBackendStatus(false);

  refreshBtn.disabled = true;

  try {
    const data = await api("/admin/overview");

    setBackendStatus(true);

    state.users = Array.isArray(data.users)
      ? data.users.map(normalizeUser)
      : [];

    totalUsersEl.textContent =
      Number(data.totalUsers ?? state.users.length);

    connectedUsersEl.textContent =
      Number(
        data.connectedUsers ??
        state.users.filter(
          (user) => user.status === "connected"
        ).length
      );

    savedSessionsEl.textContent =
      Number(
        data.savedSessions ??
        state.users.filter(
          (user) => user.saved
        ).length
      );

    activeNowEl.textContent =
      Number(
        data.activeNow ??
        data.connectedUsers ??
        state.users.filter(
          (user) => user.status === "connected"
        ).length
      );

    renderUsers();

    clearNotice();
  } catch (error) {
    setBackendStatus(false);

    setNotice(
      "Admin API is not connected yet. The frontend is ready, but the protected admin endpoints still need to be added to the Mini-bot backend.",
      "error",
      0
    );
  } finally {
    refreshBtn.disabled = false;
  }
}


/* =========================================================
   RENDER USERS
========================================================= */

function renderUsers() {
  const search =
    searchInput.value
      .trim()
      .toLowerCase();

  const filter =
    statusFilter.value;

  let users = [...state.users];

  if (search) {
    users = users.filter((user) =>
      String(user.number)
        .toLowerCase()
        .includes(search)
    );
  }

  if (filter !== "all") {
    users = users.filter((user) => {
      if (filter === "connected") {
        return user.status === "connected";
      }

      if (filter === "disconnected") {
        return user.status !== "connected";
      }

      return true;
    });
  }

  if (!users.length) {
    usersBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <div class="empty-icon">◌</div>

            <h3>No users found</h3>

            <p>
              There are no users matching the current search or filter.
            </p>
          </div>
        </td>
      </tr>
    `;

    return;
  }

  usersBody.innerHTML = users
    .map((user) => {
      const connected =
        user.status === "connected";

      const statusClass =
        connected
          ? "connected"
          : "disconnected";

      const statusText =
        connected
          ? "Connected"
          : "Disconnected";

      const safeNumber =
        escapeHtml(
          String(user.number || "Unknown")
        );

      return `
        <tr>
          <td class="number-cell">
            ${safeNumber}
            <small>
              WhatsApp account
            </small>
          </td>

          <td>
            <span class="status-badge ${statusClass}">
              ${statusText}
            </span>
          </td>

          <td>
            ${
              user.saved
                ? `
                  <span class="status-badge connected">
                    Saved
                  </span>
                `
                : `
                  <span class="status-badge disconnected">
                    Not saved
                  </span>
                `
            }
          </td>

          <td>
            ${escapeHtml(
              formatDate(user.lastActivity)
            )}
          </td>

          <td>
            <div class="actions">

              ${
                connected
                  ? `
                    <button
                      class="action-btn disconnect"
                      data-action="disconnect"
                      data-number="${safeNumber}"
                    >
                      Disconnect
                    </button>
                  `
                  : ""
              }

              <button
                class="action-btn remove"
                data-action="remove"
                data-number="${safeNumber}"
              >
                Remove
              </button>

            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   ACTION CONFIRMATION
========================================================= */

function openConfirmModal(action, number) {
  state.pendingAction = {
    action,
    number,
  };

  if (action === "disconnect") {
    confirmTitle.textContent =
      "Disconnect user?";

    confirmMessage.textContent =
      `This will disconnect ${number} from the WhatsApp bot. The saved session will not be removed.`;

    confirmActionBtn.textContent =
      "Disconnect";
  }

  if (action === "remove") {
    confirmTitle.textContent =
      "Remove user?";

    confirmMessage.textContent =
      `This will remove ${number} from the bot and delete its saved session. This action cannot be undone.`;

    confirmActionBtn.textContent =
      "Remove user";
  }

  confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
  state.pendingAction = null;

  confirmModal.classList.add("hidden");
}


/* =========================================================
   PERFORM ACTION
========================================================= */

async function performAction() {
  if (!state.pendingAction) {
    return;
  }

  const {
    action,
    number,
  } = state.pendingAction;

  confirmActionBtn.disabled = true;

  const originalText =
    confirmActionBtn.textContent;

  confirmActionBtn.textContent =
    action === "disconnect"
      ? "DISCONNECTING..."
      : "REMOVING...";

  try {
    if (action === "disconnect") {
      await api("/admin/disconnect", {
        method: "POST",
        body: {
          number,
        },
      });

      setNotice(
        `${number} has been disconnected.`,
        "success"
      );
    }

    if (action === "remove") {
      await api(
        `/admin/user/${encodeURIComponent(number)}`,
        {
          method: "DELETE",
        }
      );

      setNotice(
        `${number} has been removed.`,
        "success"
      );
    }

    closeConfirmModal();

    await loadDashboard();
  } catch (error) {
    setNotice(
      error.message ||
        "The requested action failed.",
      "error"
    );
  } finally {
    confirmActionBtn.disabled = false;

    confirmActionBtn.textContent =
      originalText;
  }
}


/* =========================================================
   LOGOUT
========================================================= */

function logout(showMessage = true) {
  state.token = "";
  state.users = [];

  sessionStorage.removeItem(
    "scanty_admin_token"
  );

  showLogin();

  setBackendStatus(false);

  if (showMessage) {
    setNotice(
      "You have been logged out.",
      "success"
    );
  }
}


/* =========================================================
   EVENTS
========================================================= */

loginForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const password =
      passwordInput.value.trim();

    if (!password) {
      loginError.textContent =
        "Enter the admin password.";

      loginError.classList.remove(
        "hidden"
      );

      return;
    }

    await login(password);
  }
);


passwordToggle.addEventListener(
  "click",
  () => {
    const isPassword =
      passwordInput.type === "password";

    passwordInput.type =
      isPassword
        ? "text"
        : "password";

    passwordToggle.textContent =
      isPassword
        ? "HIDE"
        : "SHOW";
  }
);


refreshBtn.addEventListener(
  "click",
  async () => {
    await loadDashboard();
  }
);


logoutBtn.addEventListener(
  "click",
  () => {
    logout(true);
  }
);


searchInput.addEventListener(
  "input",
  () => {
    renderUsers();
  }
);


statusFilter.addEventListener(
  "change",
  () => {
    renderUsers();
  }
);


usersBody.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest(
        "[data-action]"
      );

    if (!button) {
      return;
    }

    const action =
      button.dataset.action;

    const number =
      button.dataset.number;

    if (!number) {
      return;
    }

    openConfirmModal(
      action,
      number
    );
  }
);


cancelActionBtn.addEventListener(
  "click",
  () => {
    closeConfirmModal();
  }
);


confirmActionBtn.addEventListener(
  "click",
  async () => {
    await performAction();
  }
);


confirmModal.addEventListener(
  "click",
  (event) => {
    if (
      event.target === confirmModal
    ) {
      closeConfirmModal();
    }
  }
);


/* =========================================================
   INITIAL STARTUP
========================================================= */

if (state.token) {
  showDashboard();

  loadDashboard();
} else {
  showLogin();
}
