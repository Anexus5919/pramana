/**
 * Shared-element ids. The dashboard queue row and the workspace header both render the institution
 * name as a motion element with this layoutId so the title travels into the workspace.
 */
export function appTitleLayoutId(appId: string): string {
  return `app-title-${appId}`;
}

/** Router state passed when opening an application, so its header can render before data loads. */
export interface AppNavState {
  institution?: string;
  from?: string;
}
