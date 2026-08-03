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
    syncDetails: document.querySelector("#syncDetails"), syncNow: document.querySelector("#syncNowButton"),
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

  function isMissingCloudTable(error) {
    const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
    return message.includes("jooyoon_mission_states") || message.includes("relation") || message.includes("schema cache");
  }

  function updateSyncDetails(timestamp = lastRemoteTimestamp) {
    const el = ui();
    if (!el.syncDetails) return;
    if (!user) { el.syncDetails.textContent = "로그인하면 기기 간 기록을 확인할 수 있어요."; return; }
    const time = timestamp ? new Intl.DateTimeFormat("ko-KR", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" }).format(new Date(timestamp)) : "아직 없음";
    el.syncDetails.textContent = `계정: ${user.email} · 마지막 동기화: ${time}`;
  }

  function updateAuthUI() {
    const el = ui();
    if (user) {
      el.description.textContent = `${user.email} 계정으로 동기화하고 있어요.`;
      el.fields.hidden = true; el.actions.hidden = true; el.syncNow.hidden = false; el.signOut.hidden = false;
      setStatus("online", "동기화됨");
    } else {
      el.description.textContent = "부모님 이메일로 로그인하면 모든 기기에서 같은 기록을 볼 수 있어요.";
      el.fields.hidden = false; el.actions.hidden = false; el.syncNow.hidden = true; el.signOut.hidden = true;
      setStatus("", "기기 저장 중");
    }
    updateSyncDetails();
  }

  async function pullRemote() {
    if (!user) return false;
    setStatus("syncing", "불러오는 중");
    const { data, error } = await client.from("jooyoon_mission_states").select("state,updated_at").eq("user_id", user.id).maybeSingle();
    if (error) {
      setStatus("error", isMissingCloudTable(error) ? "클라우드 설정 필요" : "연결 확인 필요");
      showMessage(error.message);
      return false;
    }
    if (data?.state) {
      lastRemoteTimestamp = data.updated_at || "";
      const local = window.getJooyoonLocalState?.();
      const localTime = Date.parse(local?.updatedAt || 0), remoteTime = Date.parse(data.updated_at || data.state.updatedAt || 0);
      if (local && localTime > remoteTime + 1000 && !await pushRemote(local)) return false;
      else window.applyJooyoonCloudState?.(data.state);
    } else {
      const local = window.getJooyoonLocalState?.();
      if (local && !await pushRemote(local)) return false;
    }
    setStatus("online", "동기화됨");
    updateSyncDetails();
    return true;
  }

  async function pushRemote(state) {
    if (!user) return false;
    setStatus("syncing", "저장 중");
    const { data, error } = await client.from("jooyoon_mission_states").upsert({ user_id: user.id, state, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select("updated_at").single();
    if (error) {
      setStatus("error", isMissingCloudTable(error) ? "클라우드 설정 필요" : "저장 실패");
      return false;
    }
    lastRemoteTimestamp = data?.updated_at || "";
    setStatus("online", "동기화됨");
    updateSyncDetails();
    return true;
  }

  function subscribe() {
    if (channel) client.removeChannel(channel);
    if (!user) return;
    channel = client.channel(`mission-${user.id}`).on("postgres_changes", {
      event: "*", schema: "public", table: "jooyoon_mission_states", filter: `user_id=eq.${user.id}`
    }, async (payload) => {
      if (payload.new?.updated_at === lastRemoteTimestamp) return;
      lastRemoteTimestamp = payload.new?.updated_at || "";
      if (payload.new?.state) {
        const local = window.getJooyoonLocalState?.();
        const localTime = Date.parse(local?.updatedAt || 0), remoteTime = Date.parse(payload.new.updated_at || payload.new.state.updatedAt || 0);
        if (local && localTime > remoteTime + 1000) await pushRemote(local);
        else window.applyJooyoonCloudState?.(payload.new.state);
      }
      updateSyncDetails();
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") { setStatus("online", "동기화됨"); updateSyncDetails(); }
      if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) setStatus("error", "실시간 연결 확인");
    });
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
    el.syncNow.addEventListener("click", async () => { showMessage("최신 기록을 확인하고 있어요…", true); const ok = await pullRemote(); showMessage(ok ? "동기화를 확인했어요." : "동기화에 실패했어요. 연결 상태와 클라우드 설정을 확인해 주세요.", ok); });
    window.addEventListener("online", () => { if (user) pullRemote(); });
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
