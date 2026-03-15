export const error = (...args: any[]) => {
  console.error("[ERROR]", new Date().toISOString(), ...args);
};
