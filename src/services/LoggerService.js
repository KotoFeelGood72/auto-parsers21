const path = require('path');
const fs = require('fs');

/**
 * Сервис логирования для парсеров
 * Обеспечивает централизованное логирование ошибок и событий
 */
class LoggerService {
    constructor(config = {}) {
        this.config = {
            logLevel: 'info',
            logDir: path.join(process.cwd(), 'logs'),
            maxFiles: 10,
            maxSize: '10MB',
            enableConsole: true,
            enableFile: true,
            enableTelegram: false,
            ...config
        };

        this.logger = null;
        this.telegramService = null;
        this.errorCounts = new Map(); // Счетчик ошибок по типам
        this.lastErrorTime = new Map(); // Время последней ошибки по типу
        
        this.initializeLogger();
    }

    /**
     * Инициализация логгера
     */
    initializeLogger() {
        // Создаем директорию для логов если её нет
        if (!fs.existsSync(this.config.logDir)) {
            fs.mkdirSync(this.config.logDir, { recursive: true });
        }

        // Простая реализация логгера без Winston
        this.logger = {
            error: (message, meta = {}) => this.log('error', message, meta),
            warn: (message, meta = {}) => this.log('warn', message, meta),
            info: (message, meta = {}) => this.log('info', message, meta),
            debug: (message, meta = {}) => this.log('debug', message, meta)
        };
    }

    /**
     * Простое логирование
     * @param {string} level - Уровень логирования
     * @param {string} message - Сообщение
     * @param {Object} meta - Дополнительные данные
     */
    log(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...meta
        };

        const logLine = `${timestamp} [${level.toUpperCase()}] ${message} ${JSON.stringify(meta)}`;

        // Консольный вывод
        if (this.config.enableConsole) {
            const colors = {
                error: '\x1b[31m', // красный
                warn: '\x1b[33m',  // желтый
                info: '\x1b[32m',  // зеленый
                debug: '\x1b[36m'  // голубой
            };
            const reset = '\x1b[0m';
            console.log(`${colors[level] || ''}${logLine}${reset}`);
        }

        // Файловый вывод
        if (this.config.enableFile) {
            this.writeToFile('parser.log', JSON.stringify(logEntry) + '\n');
            
            if (level === 'error') {
                this.writeToFile('errors.log', JSON.stringify(logEntry) + '\n');
            }
        }
    }

    /**
     * Запись в файл
     * @param {string} filename - Имя файла
     * @param {string} content - Содержимое
     */
    writeToFile(filename, content) {
        try {
            const filePath = path.join(this.config.logDir, filename);
            fs.appendFileSync(filePath, content);
        } catch (error) {
            console.error('Ошибка записи в файл лога:', error.message);
        }
    }

    /**
     * Установка Telegram сервиса
     * @param {TelegramService} telegramService 
     */
    setTelegramService(telegramService) {
        this.telegramService = telegramService;
        this.config.enableTelegram = true;
    }

    /**
     * Парсинг размера файла
     * @param {string} sizeStr 
     * @returns {number}
     */
    parseSize(sizeStr) {
        const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
        const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
        if (match) {
            return parseFloat(match[1]) * units[match[2].toUpperCase()];
        }
        return 10 * 1024 * 1024; // 10MB по умолчанию
    }

    /**
     * Логирование ошибки парсера
     * @param {string} parserName - Имя парсера
     * @param {Error} error - Объект ошибки
     * @param {Object} context - Дополнительный контекст
     */
    async logParserError(parserName, error, context = {}) {
        const errorKey = `${parserName}:${error.name || 'Unknown'}`;
        const now = new Date();
        
        // Обновляем счетчики
        this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
        this.lastErrorTime.set(errorKey, now);

        const errorData = {
            parser: parserName,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context,
            timestamp: now.toISOString(),
            count: this.errorCounts.get(errorKey)
        };

        // Логируем в файл и консоль
        this.logger.error(`Parser Error [${parserName}]: ${error.message}`, errorData);

        // Отправляем в Telegram если включено
        if (this.config.enableTelegram && this.telegramService) {
            await this.sendTelegramNotification(parserName, error, context, errorData.count);
        }
    }

    /**
     * Логирование системной ошибки
     * @param {string} component - Компонент системы
     * @param {Error} error - Объект ошибки
     * @param {Object} context - Дополнительный контекст
     */
    async logSystemError(component, error, context = {}) {
        const errorData = {
            component,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context,
            timestamp: new Date().toISOString()
        };

        this.logger.error(`System Error [${component}]: ${error.message}`, errorData);

        // Отправляем в Telegram если включено
        if (this.config.enableTelegram && this.telegramService) {
            await this.sendTelegramNotification(component, error, context, 1, 'system');
        }
    }

    /**
     * Логирование информационного сообщения
     * @param {string} message - Сообщение
     * @param {Object} meta - Дополнительные данные
     */
    logInfo(message, meta = {}) {
        this.logger.info(message, meta);
    }

    /**
     * Логирование предупреждения
     * @param {string} message - Сообщение
     * @param {Object} meta - Дополнительные данные
     */
    logWarning(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    /**
     * Логирование успешного события
     * @param {string} parserName - Имя парсера
     * @param {Object} stats - Статистика
     */
    logSuccess(parserName, stats = {}) {
        this.logger.info(`Parser Success [${parserName}]`, {
            parser: parserName,
            stats,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Отправка уведомления в Telegram
     * @param {string} component - Компонент
     * @param {Error} error - Ошибка
     * @param {Object} context - Контекст
     * @param {number} count - Количество повторений
     * @param {string} type - Тип ошибки (parser/system)
     */
    async sendTelegramNotification(component, error, context, count = 1, type = 'parser') {
        try {
            const emoji = type === 'parser' ? '🚨' : '⚠️';
            const title = type === 'parser' ? 'Ошибка парсера' : 'Системная ошибка';
            
            let message = `${emoji} *${title}*\n\n`;
            message += `*Компонент:* ${component}\n`;
            message += `*Ошибка:* ${error.name || 'Unknown'}\n`;
            message += `*Сообщение:* ${error.message}\n`;
            message += `*Повторений:* ${count}\n`;
            message += `*Время:* ${new Date().toLocaleString('ru-RU')}\n`;

            if (context.url) {
                message += `*URL:* ${context.url}\n`;
            }
            if (context.parserName) {
                message += `*Парсер:* ${context.parserName}\n`;
            }

            // Добавляем стек только для критических ошибок
            if (error.stack && count <= 3) {
                const stackLines = error.stack.split('\n').slice(0, 5);
                message += `\n*Стек:*\n\`\`\`\n${stackLines.join('\n')}\`\`\``;
            }

            await this.telegramService.sendMessage(message);
        } catch (telegramError) {
            this.logger.error('Failed to send Telegram notification', {
                originalError: error.message,
                telegramError: telegramError.message
            });
        }
    }

    /**
     * Получение статистики ошибок
     * @returns {Object}
     */
    getErrorStats() {
        const stats = {};
        for (const [key, count] of this.errorCounts) {
            const [parser, errorType] = key.split(':');
            if (!stats[parser]) {
                stats[parser] = {};
            }
            stats[parser][errorType] = {
                count,
                lastTime: this.lastErrorTime.get(key)
            };
        }
        return stats;
    }

    /**
     * Очистка статистики ошибок
     */
    clearErrorStats() {
        this.errorCounts.clear();
        this.lastErrorTime.clear();
        this.logger.info('Error statistics cleared');
    }

    /**
     * Получение логгера Winston
     * @returns {winston.Logger}
     */
    getLogger() {
        return this.logger;
    }
}

// Создаем глобальный экземпляр
const loggerService = new LoggerService();

module.exports = { LoggerService, loggerService };
