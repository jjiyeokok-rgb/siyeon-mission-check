(function () {
  const config = window.JOOYOON_CLOUD_CONFIG;
  const sdk = window.supabase;
  let client = null;
  let user = null;
  let saveTimer = null;
  let channel = null;
  let lastRemoteTimestamp = "";

  const ui = () => ({
    button: document.querySelector("#cloudButton"), label: document.querySelector("#cloudLabel"),
    modal: document.querySelector("#authModal"), form: document.querySelector("#authForm"),
    fields: document.querySelector("#authFields"), actions: document.querySelector("#authActions"),
    email: document.querySelector("#authEmail"), password: document.querySelector("#authPassword"),
    message: document.querySelector("#authMessage"), description: document.querySelector("#authDescription"),
    signOut: document.querySelector("#signOutButton")
  });

  function setStatus(type, text) {
    const el = ui();
    if (!el.button) return;
    el.button.classList.remove("online", "syncing", "error");
    if (type) el.button.classList.add(type);
    el.label.textContent = text;
  }

  function showMessage(text, success = false) {
    const el = ui(); el.message.textContent = text; el.message.classList.toggle("success", success);
  }

  function updateAuthUI() {
    const el = ui();
    if (user) {
      el.description.textContent = `${user.email} 계정으로 동기화하고 있어요.`;
      el.fields.hidden = true; el.actions.hidden = true; el.signOut.hidden = false;
      setStatus("online", "동기화됨");
    } else {
      el.description.textContent = "부모님 이메일로 로그인하면 모든 기기에서 같은 기록을 볼 수 있어요.";
      el.fields.hidden = false; el.actions.hidden = false; el.signOut.hidden = true;
      setStatus("", "기기 저장 중");
    }
  }

  async function pullRemote() {
    if (!user) return;
    setStatus("syncing", "불러오는 중");
    const { data, error } = await client.from("jooyoon_mission_states").select("state,updated_at").eq("user_id", user.id).maybeSingle();
    if (error) { setStatus("error", "연결 확인 필요"); showMessage(error.message); return; }
    if (data?.state) {
      lastRemoteTimestamp = data.updated_at || "";
      window.applyJooyoonCloudState?.(data.state);
    } else {
      const local = window.getJooyoonLocalState?.();
      if (local) await pushRemote(local);
    }
    setStatus("online", "동기화됨");
  }

  async function pushRemote(state) {
    if (!user) return;
    setStatus("syncing", "저장 중");
    const { data, error } = await client.from("jooyoon_mission_states").upsert({ user_id: user.id, state, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select("updated_at").single();
    if (error) { setStatus("error", "저장 실패"); return; }
    lastRemoteTimestamp = data?.updated_at || "";
    setStatus("online", "동기화됨");
  }

  function subscribe() {
    if (channel) client.removeChannel(channel);
    if (!user) return;
    channel = client.channel(`mission-${user.id}`).on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "jooyoon_mission_states", filter: `user_id=eq.${user.id}`
    }, (payload) => {
      if (payload.new?.updated_at === lastRemoteTimestamp) return;
      lastRemoteTimestamp = payload.new?.updated_at || "";
      if (payload.new?.state) window.applyJooyoonCloudState?.(payload.new.state);
    }).subscribe();
  }

  async function init() {
    if (!sdk?.createClient || !config?.url || !config?.publishableKey) { setStatus("error", "클라우드 설정 필요"); return; }
    client = sdk.createClient(config.url, config.publishableKey);
    const { data } = await client.auth.getSession();
    user = data.session?.user || null;
    updateAuthUI();
    if (user) { subscribe(); await pullRemote(); }
    client.auth.onAuthStateChange(async (event, session) => {
      user = session?.user || null; updateAuthUI();
      if (user && event === "SIGNED_IN") { subscribe(); await pullRemote(); }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const el = ui();
    el.button.addEventListener("click", () => { el.modal.hidden = false; updateAuthUI(); });
    document.querySelector("#closeAuthButton").addEventListener("click", () => { el.modal.hidden = true; });
    el.modal.addEventListener("click", (event) => { if (event.target === el.modal) el.modal.hidden = true; });
    el.form.addEventListener("submit", async (event) => {
      event.preventDefault(); showMessage("로그인하고 있어요…", true);
      const { error } = await client.auth.signInWithPassword({ email: el.email.value.trim(), password: el.password.value });
      showMessage(error ? error.message : "로그인했어요!", !error);
      if (!error) setTimeout(() => { el.modal.hidden = true; }, 650);
    });
    document.querySelector("#signUpButton").addEventListener("click", async () => {
      if (!el.email.reportValidity() || !el.password.reportValidity()) return;
      showMessage("계정을 만들고 있어요…", true);
      const { data, error } = await client.auth.signUp({
        email: el.email.value.trim(),
        password: el.password.value,
        options: { emailRedirectTo: "https://jjiyeokok-rgb.github.io/siyeon-mission-check/jooyoon/" }
      });
      if (error) showMessage(error.message);
      else if (!data.session) showMessage("확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.", true);
      else showMessage("계정을 만들고 로그인했어요!", true);
    });
    el.signOut.addEventListener("click", async () => { await client.auth.signOut(); el.modal.hidden = true; });
    init();
  });

  window.jooyoonCloud = {
    scheduleSave(state) {
      if (!user) return;
      clearTimeout(saveTimer);
      const copy = JSON.parse(JSON.stringify(state));
      saveTimer = setTimeout(() => pushRemote(copy), 650);
    }
  };
})();
