/** @typedef {import("./BundleAnalyzerPlugin").EXPECTED_ANY} EXPECTED_ANY */
/** @typedef {ReturnType<import("webpack").Compiler["getInfrastructureLogger"]>} WebpackLogger */

/** @typedef {"debug" | "info" | "warn" | "error" | "silent"} Level */

/** @type {Level[]} */
const LEVELS = ["debug", "info", "warn", "error", "silent"];

/** @type {Map<Level, string>} */
const LEVEL_TO_CONSOLE_METHOD = new Map([
  ["debug", "log"],
  ["info", "log"],
  ["warn", "log"],
]);

class Logger {
  /** @type {Level[]} */
  static levels = LEVELS;

  /** @type {Level} */
  static defaultLevel = "info";

  /**
   * @param {Level=} level level
   */
  constructor(level = Logger.defaultLevel) {
    /** @type {Set<Level>} */
    this.activeLevels = new Set();
    this.setLogLevel(level);
  }

  /**
   * @param {Level} level level
   */
  setLogLevel(level) {
    const levelIndex = LEVELS.indexOf(level);

    if (levelIndex === -1) {
      throw new Error(
        `Invalid log level "${level}". Use one of these: ${LEVELS.join(", ")}`,
      );
    }

    this.activeLevels.clear();

    for (const [i, level] of LEVELS.entries()) {
      if (i >= levelIndex) this.activeLevels.add(level);
    }
  }

  /**
   * @template {EXPECTED_ANY[]} T
   * @param {T} args args
   */
  debug(...args) {
    if (!this.activeLevels.has("debug")) return;
    this._log("debug", ...args);
  }

  /**
   * @template {EXPECTED_ANY[]} T
   * @param {T} args args
   */
  info(...args) {
    if (!this.activeLevels.has("info")) return;
    this._log("info", ...args);
  }

  /**
   * @template {EXPECTED_ANY[]} T
   * @param {T} args args
   */
  error(...args) {
    if (!this.activeLevels.has("error")) return;
    this._log("error", ...args);
  }

  /**
   * @template {EXPECTED_ANY[]} T
   * @param {T} args args
   */
  warn(...args) {
    if (!this.activeLevels.has("warn")) return;
    this._log("warn", ...args);
  }

  /**
   * @template {EXPECTED_ANY[]} T
   * @param {Level} level level
   * @param {T} args args
   */
  _log(level, ...args) {
    // eslint-disable-next-line no-console
    console[
      /** @type {Exclude<Level, "silent">} */
      (LEVEL_TO_CONSOLE_METHOD.get(level) || level)
    ](...args);
  }

  /**
   * @param {WebpackLogger} infrastructureLogger infrastructure logger
   * @param {Level=} userLogLevel user log level
   * @param {boolean=} warned whether deprecation warning has been logged
   * @returns {WebpackLogger} logger adapter
   */
  static createInfrastructureLoggerAdapter(
    infrastructureLogger,
    userLogLevel,
    warned = false,
  ) {
    if (typeof userLogLevel === "undefined") {
      return infrastructureLogger;
    }

    const levelIndex = LEVELS.indexOf(userLogLevel);

    if (levelIndex === -1) {
      throw new Error(
        `Invalid log level "${userLogLevel}". Use one of these: ${LEVELS.join(", ")}`,
      );
    }

    /** @type {Set<Level>} */
    const activeLevels = new Set();

    for (const [i, level] of LEVELS.entries()) {
      if (i >= levelIndex) activeLevels.add(level);
    }

    if (!warned && activeLevels.has("warn")) {
      infrastructureLogger.warn(
        "The 'logLevel' option is deprecated and will be removed in a future release. " +
          "Please use webpack's 'infrastructureLogging.level' option instead.",
      );
    }

    return new Proxy(infrastructureLogger, {
      get(target, prop, receiver) {
        if (prop === "activeLevels") {
          return activeLevels;
        }

        if (prop === "setLogLevel") {
          return (/** @type {Level} */ level) => {
            const idx = LEVELS.indexOf(level);

            if (idx === -1) {
              throw new Error(
                `Invalid log level "${level}". Use one of these: ${LEVELS.join(", ")}`,
              );
            }

            activeLevels.clear();

            for (const [i, l] of LEVELS.entries()) {
              if (i >= idx) activeLevels.add(l);
            }
          };
        }

        if (prop === "getChildLogger") {
          return (/** @type {string | (() => string)} */ name) =>
            Logger.createInfrastructureLoggerAdapter(
              target.getChildLogger(name),
              userLogLevel,
              true,
            );
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          const isManagedLevel =
            LEVELS.includes(/** @type {Level} */ (prop)) || prop === "log";
          const levelToCheck = prop === "log" ? "info" : prop;

          if (
            isManagedLevel &&
            !activeLevels.has(/** @type {Level} */ (levelToCheck))
          ) {
            return () => {};
          }

          return value.bind(target);
        }

        return value;
      },
    });
  }
}

module.exports = Logger;
