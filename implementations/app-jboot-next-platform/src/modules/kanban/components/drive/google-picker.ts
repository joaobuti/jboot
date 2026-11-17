interface PickerDoc { id: string; name: string }
interface PickerResponse { action: string; docs?: PickerDoc[] }
interface PickerBuilder {
  setAppId(id: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  addView(view: unknown): PickerBuilder;
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}
interface DocsView {
  setSelectFolderEnabled(enabled: boolean): DocsView;
  setIncludeFolders(enabled: boolean): DocsView;
  setMimeTypes(types: string): DocsView;
}
interface GooglePickerApi {
  ViewId: { FOLDERS: string };
  Action: { PICKED: string; CANCEL: string };
  DocsView: new (viewId: string) => DocsView;
  PickerBuilder: new () => PickerBuilder;
}
declare global {
  interface Window {
    gapi?: { load(api: string, callback: () => void): void };
    google?: { picker?: GooglePickerApi };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadPickerApi(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => window.gapi?.load("picker", () => resolve());
    script.onerror = () => { scriptPromise = null; reject(new Error("Não foi possível carregar o seletor do Google.")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface PickerCredentials { accessToken: string; apiKey: string; appId: string }

/** Abre o seletor de pastas do Google; devolve null quando o usuário cancela. */
export async function pickDriveFolder({ accessToken, apiKey, appId }: PickerCredentials): Promise<PickerDoc | null> {
  await loadPickerApi();
  const picker = window.google?.picker;
  if (!picker) throw new Error("Não foi possível carregar o seletor do Google.");
  return new Promise<PickerDoc | null>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes("application/vnd.google-apps.folder");
    new picker.PickerBuilder()
      .setAppId(appId)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setTitle("Escolha a pasta de destino")
      .setLocale("pt-BR")
      .addView(view)
      .setCallback((response) => {
        if (response.action === picker.Action.PICKED) resolve(response.docs?.[0] ?? null);
        else if (response.action === picker.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}
