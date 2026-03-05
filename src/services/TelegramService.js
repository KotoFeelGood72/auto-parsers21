const axios = require('axios');

/**
 * Сервис для отправки уведомлений в Telegram
 * Обеспечивает отправку сообщений об ошибках и статусе парсеров
 */
class TelegramService {
    constructor(config = {}) {
        this.config = {
            botToken: process.env.TELEGRAM_BOT_TOKEN || '',
            chatId: process.env.TELEGRAM_CHAT_ID || '',
            apiUrl: 'https://api.telegram.org/bot',
            timeout: 10000,
            retryAttempts: 3,
            retryDelay: 1000,
            enableNotifications: true,
            rateLimitDelay: 1000, // Задержка между сообщениями
            ...config
        };

        this.lastMessageTime = 0;
        this.messageQueue = [];
        this.isProcessingQueue = false;
        this.isEnabled = this.config.botToken && this.config.chatId;

        if (!this.isEnabled) {
            console.warn('⚠️ Telegram уведомления отключены: не указаны botToken или chatId');
            console.warn(`   botToken: ${this.config.botToken ? 'установлен' : 'не установлен'}`);
            console.warn(`   chatId: ${this.config.chatId ? 'установлен' : 'не установлен'}`);
        } else {
            console.log('✅ Telegram уведомления включены');
        }
    }

    /**
     * Отправка сообщения в Telegram
     * @param {string} message - Текст сообщения
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<boolean>}
     */
    async sendMessage(message, options = {}) {
        if (!this.isEnabled || !this.config.enableNotifications) {
            return false;
        }

        const messageOptions = {
            disable_web_page_preview: true,
            ...options
        };

        // Добавляем сообщение в очередь для соблюдения rate limit
        return new Promise((resolve) => {
            this.messageQueue.push({
                message,
                options: messageOptions,
                resolve,
                timestamp: Date.now()
            });

            this.processQueue();
        });
    }

    /**
     * Обработка очереди сообщений
     */
    async processQueue() {
        if (this.isProcessingQueue || this.messageQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.messageQueue.length > 0) {
            const { message, options, resolve } = this.messageQueue.shift();
            
            try {
                // Соблюдаем rate limit
                const timeSinceLastMessage = Date.now() - this.lastMessageTime;
                if (timeSinceLastMessage < this.config.rateLimitDelay) {
                    await this.delay(this.config.rateLimitDelay - timeSinceLastMessage);
                }

                const success = await this.sendMessageDirect(message, options);
                resolve(success);
                this.lastMessageTime = Date.now();

            } catch (error) {
                console.error('Ошибка отправки сообщения в Telegram:', error.message);
                resolve(false);
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Прямая отправка сообщения
     * @param {string} message - Текст сообщения
     * @param {Object} options - Опции сообщения
     * @returns {Promise<boolean>}
     */
    async sendMessageDirect(message, options = {}) {
        const url = `${this.config.apiUrl}${this.config.botToken}/sendMessage`;
        
        const payload = {
            chat_id: this.config.chatId,
            text: message,
            ...options
        };

        let lastError = null;
        
        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                const response = await axios.post(url, payload, {
                    timeout: this.config.timeout,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data.ok) {
                    return true;
                } else {
                    throw new Error(`Telegram API error: ${response.data.description}`);
                }

            } catch (error) {
                lastError = error;
                
                if (attempt < this.config.retryAttempts) {
                    await this.delay(this.config.retryDelay * attempt);
                }
            }
        }

        console.error('Не удалось отправить сообщение в Telegram:', lastError.message);
        return false;
    }

    /**
     * Отправка уведомления о запуске парсера
     * @param {string} parserName - Имя парсера
     * @param {Object} config - Конфигурация парсера
     */
    async sendParserStartNotification(parserName, config = {}) {
        const message = `🚀 Запуск парсера\n\n` +
                      `Парсер: ${parserName}\n` +
                      `Время: ${new Date().toLocaleString('ru-RU')}\n` +
                      `Режим: ${config.mode || 'cycle'}\n`;

        await this.sendMessage(message);
    }

    /**
     * Отправка уведомления об успешном завершении парсера
     * @param {string} parserName - Имя парсера
     * @param {Object} stats - Статистика парсинга
     */
    async sendParserSuccessNotification(parserName, stats = {}) {
        const message = `✅ Парсер завершен успешно\n\n` +
                      `Парсер: ${parserName}\n` +
                      `Обработано: ${stats.processed || 0} объявлений\n` +
                      `Время выполнения: ${stats.duration || 'неизвестно'}\n` +
                      `Время завершения: ${new Date().toLocaleString('ru-RU')}\n`;

        await this.sendMessage(message);
    }

    /**
     * Отправка уведомления о критической ошибке
     * @param {string} component - Компонент
     * @param {Error} error - Ошибка
     * @param {Object} context - Контекст
     */
    async sendCriticalErrorNotification(component, error, context = {}) {
        let message = `🚨 КРИТИЧЕСКАЯ ОШИБКА\n\n` +
                      `Компонент: ${component}\n` +
                      `Ошибка: ${error.name || 'Unknown'}\n` +
                      `Сообщение: ${error.message}\n` +
                      `Время: ${new Date().toLocaleString('ru-RU')}\n`;

        if (context.url) {
            message += `URL: ${context.url}\n`;
        }

        await this.sendMessage(message);
    }

    /**
     * Отправка ежедневного отчета
     * @param {Object} dailyStats - Статистика за день
     */
    async sendDailyReport(dailyStats = {}) {
        const message = `📊 *Ежедневный отчет*\n\n` +
                      `*Дата:* ${new Date().toLocaleDateString('ru-RU')}\n` +
                      `*Всего обработано:* ${dailyStats.totalProcessed || 0} объявлений\n` +
                      `*Ошибок:* ${dailyStats.totalErrors || 0}\n` +
                      `*Активных парсеров:* ${dailyStats.activeParsers || 0}\n\n`;

        if (dailyStats.parserStats) {
            message += `*Статистика по парсерам:*\n`;
            for (const [parser, stats] of Object.entries(dailyStats.parserStats)) {
                message += `• ${parser}: ${stats.processed || 0} объявлений\n`;
            }
        }

        await this.sendMessage(message);
    }

    /**
     * Отправка уведомления о состоянии системы
     * @param {Object} systemStatus - Статус системы
     */
    async sendSystemStatusNotification(systemStatus = {}) {
        const message = `💻 *Статус системы*\n\n` +
                      `*Память:* ${systemStatus.memory || 'неизвестно'}\n` +
                      `*CPU:* ${systemStatus.cpu || 'неизвестно'}\n` +
                      `*Активные парсеры:* ${systemStatus.activeParsers || 0}\n` +
                      `*Время:* ${new Date().toLocaleString('ru-RU')}\n`;

        await this.sendMessage(message);
    }

    /**
     * Отправка уведомления о смене модуля парсера
     * @param {string} fromModule - Старый модуль
     * @param {string} toModule - Новый модуль
     * @param {Object} info - Дополнительная информация
     */
    async sendModuleChangeNotification(fromModule, toModule, info = {}) {
        const message = `🔄 Смена модуля парсера\n\n` +
                      `С модуля: ${fromModule}\n` +
                      `На модуль: ${toModule}\n` +
                      `Время: ${new Date().toLocaleString('ru-RU')}\n` +
                      (info.reason ? `Причина: ${info.reason}\n` : '');

        await this.sendMessage(message);
    }

    /**
     * Тестовая отправка сообщения
     * @returns {Promise<boolean>}
     */
    async testConnection() {
        const message = `🧪 *Тест подключения*\n\n` +
                      `Telegram сервис работает!\n` +
                      `Время: ${new Date().toLocaleString('ru-RU')}`;

        return await this.sendMessage(message);
    }

    /**
     * Включение/отключение уведомлений
     * @param {boolean} enabled 
     */
    setNotificationsEnabled(enabled) {
        this.config.enableNotifications = enabled;
        console.log(`Telegram уведомления ${enabled ? 'включены' : 'отключены'}`);
    }

    /**
     * Проверка статуса сервиса
     * @returns {Object}
     */
    getStatus() {
        return {
            enabled: this.isEnabled,
            notificationsEnabled: this.config.enableNotifications,
            queueLength: this.messageQueue.length,
            isProcessingQueue: this.isProcessingQueue,
            lastMessageTime: this.lastMessageTime
        };
    }

    /**
     * Задержка
     * @param {number} ms - Миллисекунды
     * @returns {Promise<void>}
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Создаем глобальный экземпляр
const telegramService = new TelegramService();

module.exports = { TelegramService, telegramService };
