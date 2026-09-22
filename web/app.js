const qs = new URLSearchParams(location.search);
const invite = qs.get("invite") || "";
const form = document.querySelector("#form");
const nameInput = document.querySelector("#name");
const passwordInput = document.querySelector("#password");
const message = document.querySelector("#message");
const inviteBox = document.querySelector("#inviteBox");
let mode = "login";

function setMode(next) {
  mode = next;
  nameInput.hidden = mode !== "register";
  nameInput.required = mode === "register";
  passwordInput.autocomplete = mode === "register" ? "new-password" : "current-password";
  form.querySelector(".primary").textContent = mode === "register" ? "Criar conta" : "Entrar";
}
document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

async function api(path, options={}) {
  if (location.pathname.includes("/archiveviewer/")) {
    throw new Error("Esta página está aberta em uma prévia estática (Archive Viewer). Abra o Sifistk pelo servidor Node em http://localhost:8787 ou pelo endereço público configurado.");
  }
  let r;
  try {
    r = await fetch(path, { ...options, headers: {"content-type":"application/json", ...(options.headers||{})}, cache:"no-store" });
  } catch (error) {
    if (error?.name === "TypeError") {
      throw new Error("Não foi possível conectar ao servidor da Sifistk. Abra o site pelo servidor Node e confira o endereço de rede.");
    }
    throw error;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

(async () => {
  if (invite) {
    try {
      await api("/api/invites/validate", {method:"POST",body:JSON.stringify({token:invite})});
      inviteBox.textContent = "Convite válido. Você pode criar sua conta.";
      setMode("register");
    } catch (error) {
      inviteBox.textContent = error.message.includes("prévia estática") || error.message.includes("conectar ao servidor")
        ? error.message
        : "Este convite é inválido, expirou ou já foi utilizado.";
    }
  } else {
    inviteBox.textContent = "Você pode entrar com uma conta existente. Para criar uma conta nova, solicite um convite.";
  }
})();

form.addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = form.querySelector(".primary");
  if (submitButton.disabled) return;
  submitButton.disabled = true;
  message.className = "message";
  message.textContent = "Processando…";
  try {
    const payload = { email: document.querySelector("#email").value.trim(), password: passwordInput.value };
    if (mode === "register") Object.assign(payload, {name:nameInput.value.trim(), invite});
    const data = await api(mode === "register" ? "/api/auth/register" : "/api/auth/login", {method:"POST",body:JSON.stringify(payload)});
    message.className = "message ok";
    message.textContent = mode === "register" ? "Conta criada. Acesso liberado." : "Login realizado.";
    window.location.assign("/app/");
  } catch (error) {
    message.className = "message error";
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});
