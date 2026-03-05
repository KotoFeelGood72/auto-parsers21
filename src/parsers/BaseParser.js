const { errorHandler } = require('../services/ErrorHandler');

/**
 * Базовый класс для всех парсеров
 * Определяет интерфейс, который должен реализовать каждый парсер
 */
class BaseParser {
    constructor(name, config = {}) {
        this.name = name;
        this.config = {
            // Базовые настройки по умолчанию
            maxRetries: 3,
            timeout: 60000,
            delayBetweenRequests: 1000,
            enableImageLoading: false,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ...config
        };
    }

    /**
     * Инициализация парсера
     * @param {Object} context - Контекст браузера Playwright
     * @param {Object} databaseManager - Менеджер базы данных
     * @returns {Promise<void>}
     */
    async initialize(context, databaseManager = null) {
        this.context = context;
        this.databaseManager = databaseManager;
        
        console.log(`🚀 Инициализация парсера: ${this.name}`);
    }

    /**
     * Получение списка объявлений (генератор)
     * @yields {string} URL объявления
     */
    async* getListings() {
        throw new Error(`Метод getListings() должен быть реализован в парсере ${this.name}`);
    }

    /**
     * Парсинг детальной информации об объявлении
     * @param {string} url - URL объявления
     * @returns {Promise<Object|null>} Данные объявления или null при ошибке
     */
    async parseListing(url) {
        throw new Error(`Метод parseListing() должен быть реализован в парсере ${this.name}`);
    }

    /**
     * Валидация данных объявления
     * @param {Object} data - Данные объявления
     * @returns {boolean} true если данные валидны
     */
    validateData(data) {
        return data && data.short_url && data.title;
    }

    /**
     * Нормализация данных для сохранения в БД
     * @param {Object} rawData - Сырые данные с сайта
     * @returns {Object} Нормализованные данные
     */
    normalizeData(rawData) {
        return {
            short_url: rawData.short_url || null,
            title: rawData.title || "Неизвестно",
            make: rawData.make || "Неизвестно",
            model: rawData.model || "Неизвестно",
            year: rawData.year || "Неизвестно",
            body_type: rawData.body_type || "Неизвестно",
            horsepower: rawData.horsepower || "Неизвестно",
            fuel_type: rawData.fuel_type || "Неизвестно",
            motors_trim: rawData.motors_trim || "Неизвестно",
            kilometers: rawData.kilometers || "Неизвестно",
            price_formatted: rawData.price?.formatted || "0",
            price_raw: rawData.price?.raw || 0,
            currency: rawData.price?.currency || "Неизвестно",
            exterior_color: rawData.exterior_color || "Неизвестно",
            location: rawData.location || "Неизвестно",
            phone: rawData.contact?.phone || "Не указан",
            seller_name: rawData.sellers?.sellerName || "Неизвестен",
            seller_type: rawData.sellers?.sellerType || "Неизвестен",
            seller_logo: rawData.sellers?.sellerLogo || null,
            seller_profile_link: rawData.sellers?.sellerProfileLink || null,
            main_image: rawData.main_image || null,
            photos: rawData.photos || []
        };
    }

    /**
     * Создание новой страницы с настройками
     * @returns {Promise<Object>} Страница Playwright
     */
    async createPage() {
        const page = await this.context.newPage();
        
        // Настройка заголовков
        await page.setExtraHTTPHeaders({
            "User-Agent": this.config.userAgent
        });

        // Отключение загрузки изображений если нужно
        if (!this.config.enableImageLoading) {
            await page.route('**/*.{png,jpg,jpeg,gif,svg,webp}', route => route.abort());
        }

        return page;
    }

    /**
     * Безопасное выполнение функции на странице
     * @param {Object} page - Страница Playwright
     * @param {string} selector - CSS селектор
     * @param {Function} callback - Функция для выполнения
     * @returns {Promise<any>} Результат выполнения
     */
    async safeEval(page, selector, callback) {
        try {
            return await page.$eval(selector, callback);
        } catch (error) {
            console.warn(`⚠️ Ошибка при парсинге селектора ${selector}:`, error.message);
            await errorHandler.handleParsingError(this.name, error, {
                selector,
                parserName: this.name,
                context: 'safeEval'
            });
            return null;
        }
    }

    /**
     * Безопасное выполнение функции для множественных элементов
     * @param {Object} page - Страница Playwright
     * @param {string} selector - CSS селектор
     * @param {Function} callback - Функция для выполнения
     * @returns {Promise<Array>} Массив результатов
     */
    async safeEvalAll(page, selector, callback) {
        try {
            return await page.$$eval(selector, callback);
        } catch (error) {
            console.warn(`⚠️ Ошибка при парсинге множественных элементов ${selector}:`, error.message);
            return [];
        }
    }

    /**
     * Задержка между запросами
     * @param {number} ms - Миллисекунды задержки
     * @returns {Promise<void>}
     */
    async delay(ms = null) {
        const delayTime = ms || this.config.delayBetweenRequests;
        await new Promise(resolve => setTimeout(resolve, delayTime));
    }

    /**
     * Очистка ресурсов парсера
     * @returns {Promise<void>}
     */
    async cleanup() {
        console.log(`🧹 Очистка ресурсов парсера: ${this.name}`);
        // Переопределяется в дочерних классах при необходимости
    }
}

module.exports = { BaseParser };
