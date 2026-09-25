export async function resolvePlayTogetherStartup({ restoreSession, loadAuthenticated }) {
  let session;
  try {
    session = await restoreSession();
  } catch (error) {
    return { state: "AUTH_REQUIRED", error };
  }

  if (!session) return { state: "AUTH_REQUIRED", error: null };

  try {
    return { state: "READY", value: await loadAuthenticated(), error: null };
  } catch (error) {
    if (error?.status === 401) return { state: "AUTH_REQUIRED", error };
    return { state: "LOAD_ERROR", error };
  }
}
