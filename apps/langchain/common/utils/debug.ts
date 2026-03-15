const DEBUG = process.env.DEBUG === "true" || true;

export const debug = (...args: any[]) => {
  if (DEBUG) {
    console.log("[DEBUG]", new Date().toISOString(), ...args);
  }
};
