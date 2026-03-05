const { loggerService } = require('./LoggerService');
const { telegramService } = require('./TelegramService');

/**
 * Централизованный обработчик ошибок для парсеров
 * Обеспечивает единообразную обработку всех типов ошибок
 */
class ErrorHandler {
    constructor(config = {}) {
        this.config = {
            enableTelegram: true,
            enableFileLogging: true,
            enableConsoleLogging: true,
            maxErrorsPerHour: 50, // Максимум ошибок в час для одного парсера
            errorCooldown: 300000, // 5 минут между одинаковыми ошибками
            criticalErrorThreshold: 10, // Порог для критических ошибок
            ...config
        };

        this.errorCounts = new Map(); // Счетчик ошибок по парсерам
        this.lastErrorTimes = new Map(); // Время последней ошибки
        this.criticalErrors = new Set(); // Критические ошибки
        
        // Инициализируем сервисы
        this.logger = loggerService;
        this.telegram = telegramService;
        
        // Связываем сервисы
        this.logger.setTelegramService(this.telegram);
        
        // Очистка счетчиков каждый час
        setInterval(() => {
            this.clearHourlyCounters();
        }, 3600000);
    }

    /**
     * Обработка ошибки парсера
     * @param {string} parserName - Имя парсера
     * @param {Error} error - Объект ошибки
     * @param {Object} context - Дополнительный контекст
     */
    async handleParserError(parserName, error, context = {}) {
        const errorKey = `${parserName}:${error.name || 'Unknown'}`;
        const now = Date.now();
        
        // Проверяем лимиты
        if (this.isErrorRateLimited(parserName, errorKey, now)) {
            return;
        }

        // Обновляем счетчики
        this.updateErrorCounters(parserName, errorKey, now);

        // Определяем критичность ошибки
        const isCritical = this.isCriticalError(parserName, error, context);

        // Логируем ошибку
        await this.logger.logParserError(parserName, error, {
            ...context,
            isCritical,
            errorCount: this.errorCounts.get(parserName) || 0
        });

        // Отправляем критическое уведомление
        if (isCritical && this.config.enableTelegram) {
            await this.telegram.sendCriticalErrorNotification(parserName, error, context);
        }

        // Выполняем дополнительные действия для критических ошибок
        if (isCritical) {
            await this.handleCriticalError(parserName, error, context);
        }
    }

    /**
     * Обработка системной ошибки
     * @param {string} component - Компонент системы
     * @param {Error} error - Объект ошибки
     * @param {Object} context - Дополнительный контекст
     */
    async handleSystemError(component, error, context = {}) {
        // Логируем системную ошибку
        await this.logger.logSystemError(component, error, context);

        // Отправляем уведомление о критической системной ошибке
        if (this.config.enableTelegram) {
            await this.telegram.sendCriticalErrorNotification(component, error, context);
        }
    }

    /**
     * Обработка ошибки браузера
     * @param {string} parserName - Имя парсера
     * @param {Error} error - Объект ошибки
     * @param {Object} context - Контекст браузера
     */
    async handleBrowserError(parserName, error, context = {}) {
        const browserContext = {
            ...context,
            errorType: 'browser',
            url: context.url || 'unknown',
            userAgent: context.userAgent || 'unknown'
        };

        await this.handleParserError(parserName, error, browserContext);
    }

    /**
     * Обработка ошибки сети
     * @param {string} parserName - Имя парсера
     * @param {Error} error - Объект ошибки
     * @param {Object} context - Контекст сети
     */
    async handleNetworkError(parserName, error, context = {}) {
        const networkContext = {
            ...context,
            errorType: 'network',
            url: context.url || 'unknown',
            statusCode: context.statusCode || 'unknown'
        };

        await this.handleParserError(parserName, error, networkContext);
    }

    /**
     * Обработка ошибки парсинга данных
     * @param {string} parserName - Имя парсера
     * @param {Error} error - Объект ошибки
     * @param {Object} context - Контекст парсинга
     */
    async handleParsingError(parserName, error, context = {}) {
        const parsingContext = {
            ...context,
            errorType: 'parsing',
            selector: context.selector || 'unknown',
            element: context.element || 'unknown'
        };

        await this.handleParserError(parserName, error, parsingContext);
    }

    /**
     * Обработка ошибки базы данных
     * @param {string} component - Компонент
     * @param {Error} error - Объект ошибки
     * @param {Object} context - Контекст БД
     */
    async handleDatabaseError(component, error, context = {}) {
        const dbContext = {
            ...context,
            errorType: 'database',
            query: context.query || 'unknown',
            table: context.table || 'unknown'
        };

        await this.handleSystemError(component, error, dbContext);
    }

    /**
     * Проверка лимита ошибок
     * @param {string} parserName - Имя парсера
     * @param {string} errorKey - Ключ ошибки
     * @param {number} now - Текущее время
     * @returns {boolean}
     */
    isErrorRateLimited(parserName, errorKey, now) {
        const lastTime = this.lastErrorTimes.get(errorKey) || 0;
        const timeDiff = now - lastTime;
        
        // Проверяем cooldown
        if (timeDiff < this.config.errorCooldown) {
            return true;
        }

        // Проверяем лимит ошибок в час
        const hourlyCount = this.errorCounts.get(parserName) || 0;
        if (hourlyCount >= this.config.maxErrorsPerHour) {
            return true;
        }

        return false;
    }

    /**
     * Обновление счетчиков ошибок
     * @param {string} parserName - Имя парсера
     * @param {string} errorKey - Ключ ошибки
     * @param {number} now - Текущее время
     */
    updateErrorCounters(parserName, errorKey, now) {
        // Обновляем счетчик парсера
        const parserCount = this.errorCounts.get(parserName) || 0;
        this.errorCounts.set(parserName, parserCount + 1);

        // Обновляем время последней ошибки
        this.lastErrorTimes.set(errorKey, now);
    }

    /**
     * Определение критичности ошибки
     * @param {string} parserName - Имя парсера
     * @param {Error} error - Объект ошибки
     * @param {Object} context - Контекст
     * @returns {boolean}
     */
    isCriticalError(parserName, error, context) {
        // Критические типы ошибок
        const criticalErrorTypes = [
            'TimeoutError',
            'NetworkError',
            'DatabaseError',
            'MemoryError',
            'BrowserError'
        ];

        // Проверяем тип ошибки
        if (criticalErrorTypes.includes(error.name)) {
            return true;
        }

        // Проверяем количество ошибок парсера
        const errorCount = this.errorCounts.get(parserName) || 0;
        if (errorCount >= this.config.criticalErrorThreshold) {
            return true;
        }

        // Проверяем контекст
        if (context.isCritical || context.critical) {
            return true;
        }

        return false;
    }

    /**
     * Обработка критической ошибки
     * @param {string} parserName - Имя парсера
     * @param {Error} error - Объект ошибки
     * @param {Object} context - Контекст
     */
    async handleCriticalError(parserName, error, context) {
        this.criticalErrors.add(`${parserName}:${error.name}`);

        // Логируем критическую ошибку
        this.logger.logger.error(`CRITICAL ERROR in ${parserName}`, {
            error: error.message,
            stack: error.stack,
            context
        });

        // Дополнительные действия для критических ошибок
        if (error.name === 'MemoryError') {
            // Принудительная очистка памяти
            if (global.gc) {
                global.gc();
            }
        }
    }

    /**
     * Очистка счетчиков каждый час
     */
    clearHourlyCounters() {
        this.errorCounts.clear();
        this.logger.logInfo('Hourly error counters cleared');
    }

    /**
     * Получение статистики ошибок
     * @returns {Object}
     */
    getErrorStats() {
        return {
            errorCounts: Object.fromEntries(this.errorCounts),
            criticalErrors: Array.from(this.criticalErrors),
            lastErrorTimes: Object.fromEntries(this.lastErrorTimes),
            loggerStats: this.logger.getErrorStats()
        };
    }

    /**
     * Сброс всех счетчиков
     */
    resetCounters() {
        this.errorCounts.clear();
        this.lastErrorTimes.clear();
        this.criticalErrors.clear();
        this.logger.clearErrorStats();
    }

    /**
     * Тест обработчика ошибок
     * @returns {Promise<boolean>}
     */
    async test() {
        try {
            const testError = new Error('Test error for error handler');
            await this.handleParserError('test_parser', testError, { test: true });
            return true;
        } catch (error) {
            console.error('Error handler test failed:', error.message);
            return false;
        }
    }
}

// Создаем глобальный экземпляр
const errorHandler = new ErrorHandler();

module.exports = { ErrorHandler, errorHandler };
