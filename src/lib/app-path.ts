export const appBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";
export const appPath = (path = "/") => `${appBasePath}${path}`;
