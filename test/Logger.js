const Logger = require("../src/Logger");

class TestLogger extends Logger {
  constructor(level) {
    super(level);
    this.logs = [];
  }

  clear() {
    this.logs = [];
  }

  _log(level, ...args) {
    this.logs.push([level, ...args]);
  }
}

function expectLoggerLevel(logger, level) {
  logger.clear();

  const levels = Logger.levels.filter((level) => level !== "silent");

  for (const level of levels) {
    logger[level]("msg1", "msg2");
  }

  const expectedLogs = levels
    .filter(
      (testLevel) =>
        Logger.levels.indexOf(testLevel) >= Logger.levels.indexOf(level),
    )
    .map((testLevel) => [testLevel, "msg1", "msg2"]);

  expect(logger.logs).toEqual(expectedLogs);
}

function invalidLogLevelMessage(level) {
  return `Invalid log level "${level}". Use one of these: ${Logger.levels.join(", ")}`;
}

let logger;

describe("Logger", () => {
  describe("level", () => {
    for (const testingLevel of Logger.levels) {
      /* eslint-disable no-loop-func */
      describe(`"${testingLevel}"`, () => {
        beforeEach(() => {
          logger = new TestLogger(testingLevel);
        });

        for (const level of Logger.levels.filter(
          (level) => level !== "silent",
        )) {
          if (
            Logger.levels.indexOf(level) >= Logger.levels.indexOf(testingLevel)
          ) {
            it(`should log "${level}" message`, () => {
              logger[level]("msg1", "msg2");
              expect(logger.logs).toEqual([[level, "msg1", "msg2"]]);
            });
          } else {
            it(`should not log "${level}" message`, () => {
              logger[level]("msg1", "msg2");
              expect(logger.logs).toHaveLength(0);
            });
          }
        }
      });
    }

    it('should be set to "info" by default', () => {
      logger = new TestLogger();
      expectLoggerLevel(logger, "info");
    });

    it("should allow to change level", () => {
      logger = new TestLogger("warn");
      expectLoggerLevel(logger, "warn");
      logger.setLogLevel("info");
      expectLoggerLevel(logger, "info");
      logger.setLogLevel("silent");
      expectLoggerLevel(logger, "silent");
    });

    it("should throw if level is invalid on instance creation", () => {
      expect(() => new TestLogger("invalid")).toThrow(
        invalidLogLevelMessage("invalid"),
      );
    });

    it("should throw if level is invalid on `setLogLevel`", () => {
      expect(() => new TestLogger().setLogLevel("invalid")).toThrow(
        invalidLogLevelMessage("invalid"),
      );
    });
  });

  describe("parity methods", () => {
    it("should provide log(), time(), and timeEnd() methods", () => {
      const logger = new Logger("info");
      const consoleLogSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const consoleTimeSpy = jest
        .spyOn(console, "time")
        .mockImplementation(() => {});
      const consoleTimeEndSpy = jest
        .spyOn(console, "timeEnd")
        .mockImplementation(() => {});

      logger.log("log message");
      expect(consoleLogSpy).toHaveBeenCalledWith("log message");

      logger.time("timer");
      expect(consoleTimeSpy).toHaveBeenCalledWith("timer");

      logger.timeEnd("timer");
      expect(consoleTimeEndSpy).toHaveBeenCalledWith("timer");

      consoleLogSpy.mockRestore();
      consoleTimeSpy.mockRestore();
      consoleTimeEndSpy.mockRestore();
    });
  });

  describe("createInfrastructureLoggerAdapter", () => {
    function createMockInfraLogger() {
      return {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        log: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn(),
        group: jest.fn(),
        groupEnd: jest.fn(),
        groupCollapsed: jest.fn(),
        status: jest.fn(),
        clear: jest.fn(),
        profile: jest.fn(),
        profileEnd: jest.fn(),
        time: jest.fn(),
        timeLog: jest.fn(),
        timeEnd: jest.fn(),
        timeAggregate: jest.fn(),
        timeAggregateEnd: jest.fn(),
        assert: jest.fn(),
        getChildLogger: jest.fn(() => createMockInfraLogger()),
      };
    }

    it("should return the infrastructure logger directly when userLogLevel is undefined", () => {
      const mockInfra = createMockInfraLogger();
      const result = Logger.createInfrastructureLoggerAdapter(
        mockInfra,
        undefined,
      );
      expect(result).toBe(mockInfra);
    });

    it("should throw if userLogLevel is invalid", () => {
      const mockInfra = createMockInfraLogger();
      expect(() =>
        Logger.createInfrastructureLoggerAdapter(mockInfra, "invalid"),
      ).toThrow(invalidLogLevelMessage("invalid"));
    });

    it("should emit deprecation warning when userLogLevel is 'info'", () => {
      const mockInfra = createMockInfraLogger();
      const adapter = Logger.createInfrastructureLoggerAdapter(
        mockInfra,
        "info",
      );

      expect(mockInfra.warn).toHaveBeenCalledWith(
        expect.stringContaining("The 'logLevel' option is deprecated"),
      );
      expect(adapter.activeLevels.has("info")).toBe(true);
      expect(adapter.activeLevels.has("warn")).toBe(true);
      expect(adapter.activeLevels.has("error")).toBe(true);
      expect(adapter.activeLevels.has("debug")).toBe(false);
    });

    it("should not emit deprecation warning when userLogLevel is 'error' or 'silent'", () => {
      const mockInfraError = createMockInfraLogger();
      Logger.createInfrastructureLoggerAdapter(mockInfraError, "error");
      expect(mockInfraError.warn).not.toHaveBeenCalled();

      const mockInfraSilent = createMockInfraLogger();
      Logger.createInfrastructureLoggerAdapter(mockInfraSilent, "silent");
      expect(mockInfraSilent.warn).not.toHaveBeenCalled();
    });

    it("should filter calls based on activeLevels", () => {
      const mockInfra = createMockInfraLogger();
      const adapter = Logger.createInfrastructureLoggerAdapter(
        mockInfra,
        "warn",
      );
      mockInfra.warn.mockClear();

      adapter.debug("debug message");
      expect(mockInfra.debug).not.toHaveBeenCalled();

      adapter.info("info message");
      expect(mockInfra.info).not.toHaveBeenCalled();

      adapter.log("log message");
      expect(mockInfra.log).not.toHaveBeenCalled();

      adapter.warn("warn message");
      expect(mockInfra.warn).toHaveBeenCalledWith("warn message");

      adapter.error("error message");
      expect(mockInfra.error).toHaveBeenCalledWith("error message");
    });

    it("should forward trace, profile, and profileEnd when debug is active", () => {
      const mockInfra = createMockInfraLogger();
      const adapter = Logger.createInfrastructureLoggerAdapter(
        mockInfra,
        "debug",
      );

      adapter.trace();
      expect(mockInfra.trace).toHaveBeenCalled();

      adapter.profile("label");
      expect(mockInfra.profile).toHaveBeenCalledWith("label");

      adapter.profileEnd("label");
      expect(mockInfra.profileEnd).toHaveBeenCalledWith("label");
    });

    it("should forward time, timeLog, timeEnd, status, clear, and groups when info is active", () => {
      const mockInfra = createMockInfraLogger();
      const adapter = Logger.createInfrastructureLoggerAdapter(
        mockInfra,
        "info",
      );

      adapter.time("t");
      expect(mockInfra.time).toHaveBeenCalledWith("t");

      adapter.timeLog("t");
      expect(mockInfra.timeLog).toHaveBeenCalledWith("t");

      adapter.timeEnd("t");
      expect(mockInfra.timeEnd).toHaveBeenCalledWith("t");

      adapter.status("status");
      expect(mockInfra.status).toHaveBeenCalledWith("status");

      adapter.clear();
      expect(mockInfra.clear).toHaveBeenCalled();

      adapter.group("g");
      expect(mockInfra.group).toHaveBeenCalledWith("g");

      adapter.groupCollapsed("gc");
      expect(mockInfra.groupCollapsed).toHaveBeenCalledWith("gc");

      adapter.groupEnd();
      expect(mockInfra.groupEnd).toHaveBeenCalled();
    });

    it("should forward assert and timeAggregate regardless of log level", () => {
      const mockInfra = createMockInfraLogger();
      const adapter = Logger.createInfrastructureLoggerAdapter(
        mockInfra,
        "silent",
      );

      const assertion = false;
      adapter.assert(assertion, "assert fail");
      expect(mockInfra.assert).toHaveBeenCalledWith(assertion, "assert fail");

      adapter.timeAggregate("tagg");
      expect(mockInfra.timeAggregate).toHaveBeenCalledWith("tagg");

      adapter.timeAggregateEnd("tagg");
      expect(mockInfra.timeAggregateEnd).toHaveBeenCalledWith("tagg");
    });

    it("should support setLogLevel and throw on invalid level", () => {
      const mockInfra = createMockInfraLogger();
      const adapter = Logger.createInfrastructureLoggerAdapter(
        mockInfra,
        "error",
      );

      expect(adapter.activeLevels.has("warn")).toBe(false);
      adapter.setLogLevel("warn");
      expect(adapter.activeLevels.has("warn")).toBe(true);

      expect(() => adapter.setLogLevel("invalid")).toThrow(
        invalidLogLevelMessage("invalid"),
      );
    });

    it("should wrap child logger in getChildLogger", () => {
      const mockInfra = createMockInfraLogger();
      const adapter = Logger.createInfrastructureLoggerAdapter(
        mockInfra,
        "warn",
      );

      const childAdapter = adapter.getChildLogger("child");
      expect(mockInfra.getChildLogger).toHaveBeenCalledWith("child");
      expect(childAdapter.activeLevels.has("warn")).toBe(true);
      expect(childAdapter.activeLevels.has("info")).toBe(false);
    });
  });
});
