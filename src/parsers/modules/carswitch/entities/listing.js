const { telegramService } = require('../../../../services/TelegramService');
const { captchaService } = require('../../../../services/CaptchaService');

/**
 * Парсинг списка объявлений для Carswitch.com
 */

class CarswitchListingParser {
    constructor(config) {
        this.config = config;
        
        // Основные селекторы для Carswitch
        this.listingSelector = '#car-listing-content';
        this.listingStemSelector = '#car-listing-content a.block.touch-manipulation';
        
        // Селекторы для скролла
        this.scrollContainers = [
            this.listingSelector,
            "main",
            "body"
        ];
        
        // Счетчик капч для логирования
        this.captchaCount = 0;

        // Статистика для логирования
        this.stats = {
            totalPages: 0,
            totalListings: 0,
            errors: 0,
            startTime: null
        };

        // Максимальное количество страниц (защита от бесконечного цикла)
        this.maxPages = config.maxPages || 1000;
        
        // Интервал для отправки уведомлений в Telegram (каждые N страниц)
        this.telegramNotificationInterval = this.config.telegramNotificationInterval || 10;
    }

    /**
     * Проверка наличия капчи (reCAPTCHA или Amazon WAF) на странице
     */
    async checkCaptcha(page) {
        try {
            const captchaInfo = await page.evaluate(() => {
                // Проверяем модальное окно Amazon WAF капчи
                const modal = document.querySelector('.amzn-captcha-modal');
                if (modal && modal.offsetParent !== null) {
                    // Проверяем, есть ли активный пазл
                    const canvas = modal.querySelector('canvas');
                    const puzzleText = modal.textContent || '';
                    if (canvas || puzzleText.includes('Choose all') || puzzleText.includes('Confirm')) {
                        return { 
                            hasCaptcha: true, 
                            type: 'Amazon WAF', 
                            selector: '.amzn-captcha-modal',
                            isActive: true,
                            hasPuzzle: !!canvas
                        };
                    }
                }
                
                // Проверяем контейнер капчи
                const container = document.querySelector('#captcha-container');
                if (container) {
                    const modal = container.querySelector('.amzn-captcha-modal');
                    if (modal) {
                        return { 
                            hasCaptcha: true, 
                            type: 'Amazon WAF', 
                            selector: '#captcha-container',
                            isActive: true
                        };
                    }
                }
                
                // Проверяем кнопки Amazon WAF
                const verifyButton = document.querySelector('#amzn-btn-verify-internal, #amzn-captcha-verify-button');
                if (verifyButton) {
                    return { 
                        hasCaptcha: true, 
                        type: 'Amazon WAF', 
                        selector: 'button',
                        isActive: true
                    };
                }
                
                // Проверяем текст на странице для Amazon WAF
                const bodyText = document.body ? document.body.textContent : '';
                if (bodyText.includes('Let\'s confirm you are human') ||
                    bodyText.includes('Complete the security check') ||
                    bodyText.includes('Choose all') ||
                    bodyText.includes('Before proceeding to your request, you need to solve a puzzle')) {
                    return { 
                        hasCaptcha: true, 
                        type: 'Amazon WAF', 
                        selector: 'text',
                        isActive: true
                    };
                }
                
                // Проверяем Google reCAPTCHA
                const recaptchaSelectors = [
                    '.g-recaptcha',
                    '#recaptcha',
                    '.recaptcha',
                    'iframe[src*="recaptcha"]',
                    'iframe[src*="google.com/recaptcha"]',
                    '[data-sitekey]',
                    '.rc-anchor',
                    '#rc-imageselect'
                ];
                
                for (const selector of recaptchaSelectors) {
                    try {
                        if (document.querySelector(selector)) {
                            return { hasCaptcha: true, type: 'Google reCAPTCHA', selector: selector };
                        }
                    } catch (e) {
                        // Продолжаем поиск
                    }
                }
                
                // Проверяем текст на странице для Google reCAPTCHA
                const bodyTextLower = bodyText.toLowerCase();
                if (bodyTextLower.includes('recaptcha') || 
                    bodyTextLower.includes('verify you are human') ||
                    bodyTextLower.includes('verify you\'re not a robot')) {
                    return { hasCaptcha: true, type: 'Google reCAPTCHA', selector: 'text' };
                }
                
                return { hasCaptcha: false, type: null, selector: null, isActive: false };
            });
            
            return captchaInfo;
        } catch (error) {
            console.warn(`⚠️ Ошибка при проверке капчи:`, error.message);
            return { hasCaptcha: false, type: null, selector: null, isActive: false };
        }
    }

    /**
     * Обработка капчи (ожидание или пропуск)
     */
    async handleCaptcha(page, url, pageNumber) {
        const captchaInfo = await this.checkCaptcha(page);
        
        if (captchaInfo.hasCaptcha) {
            this.captchaCount++;
            console.warn(`⚠️ Обнаружена капча ${captchaInfo.type} на странице: ${url}`);
            
            // Отправляем уведомление в Telegram
            if (telegramService.getStatus().enabled) {
                await this.sendCaptchaNotification(url, captchaInfo.type, pageNumber);
            }
            
            // Для Amazon WAF с активным пазлом
            if (captchaInfo.type === 'Amazon WAF' && captchaInfo.isActive) {
                console.log(`🧩 Обнаружен активный пазл Amazon WAF. Ожидаем решения...`);
                
                // Пробуем решить капчу через сервис
                if (captchaService.getStatus().enabled) {
                    console.log(`🤖 Пробуем решить капчу автоматически через ${captchaService.getStatus().provider}...`);
                    const solved = await captchaService.solveAmazonWAF(page, url);
                    if (solved) {
                        console.log(`✅ Капча успешно решена автоматически!`);
                        await page.waitForTimeout(3000);
                        
                        // Проверяем, исчезла ли капча
                        const stillHasCaptcha = await this.checkCaptcha(page);
                        if (!stillHasCaptcha.hasCaptcha) {
                            return true;
                        }
                    } else {
                        console.warn(`⚠️ Не удалось решить капчу автоматически. Ожидаем ручного решения...`);
                    }
                } else {
                    console.log(`ℹ️ Автоматическое решение отключено. Ожидаем ручного решения (60 секунд)...`);
                    console.log(`💡 Подсказка: Установите CAPTCHA_API_KEY для автоматического решения`);
                }
                
                // Ожидаем решения капчи (ручного или автоматического)
                const maxWaitTime = 60000; // 60 секунд для ручного решения
                const checkInterval = 3000; // Проверяем каждые 3 секунды
                const startTime = Date.now();
                
                while (Date.now() - startTime < maxWaitTime) {
                    await page.waitForTimeout(checkInterval);
                    
                    // Проверяем, решена ли капча
                    const currentCaptcha = await this.checkCaptcha(page);
                    if (!currentCaptcha.hasCaptcha || !currentCaptcha.isActive) {
                        console.log(`✅ Капча решена! Продолжаем парсинг...`);
                        await page.waitForTimeout(2000); // Даем время на перезагрузку страницы
                        return true;
                    }
                    
                    // Проверяем, не появилась ли кнопка подтверждения (значит пазл решен)
                    const confirmButton = await page.$('#amzn-btn-verify-internal:not([disabled])');
                    if (confirmButton) {
                        try {
                            const buttonText = await confirmButton.textContent();
                            if (buttonText && buttonText.includes('Confirm')) {
                                console.log(`🖱️ Найдена кнопка "Confirm", кликаем...`);
                                await confirmButton.click();
                                await page.waitForTimeout(3000);
                                
                                // Проверяем еще раз
                                const finalCheck = await this.checkCaptcha(page);
                                if (!finalCheck.hasCaptcha) {
                                    console.log(`✅ Капча успешно подтверждена!`);
                                    return true;
                                }
                            }
                        } catch (e) {
                            // Продолжаем ожидание
                        }
                    }
                    
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    if (elapsed % 10 === 0) {
                        console.log(`⏳ Ожидаем решения капчи... (${elapsed}с / ${maxWaitTime / 1000}с)`);
                    }
                }
                
                // Время ожидания истекло
                console.warn(`⚠️ Время ожидания решения капчи истекло (${maxWaitTime / 1000}с). Пропускаем страницу.`);
                return false;
            }
            
            // Для других типов капчи или неактивной капчи
            console.log(`⏳ Ожидаем 15 секунд для возможного решения капчи...`);
            await page.waitForTimeout(15000);
            
            // Проверяем еще раз
            const stillHasCaptcha = await this.checkCaptcha(page);
            if (stillHasCaptcha.hasCaptcha && stillHasCaptcha.isActive) {
                console.warn(`⚠️ Капча ${stillHasCaptcha.type} все еще присутствует. Пропускаем страницу.`);
                return false;
            } else {
                console.log(`✅ Капча исчезла, продолжаем парсинг`);
                return true;
            }
        }
        
        return true; // Нет капчи, продолжаем
    }

    /**
     * Отправка уведомления о капче в Telegram
     */
    async sendCaptchaNotification(url, captchaType, pageNumber) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const message = `🚨 *Carswitch: Обнаружена капча*\n\n` +
                          `Тип: ${captchaType}\n` +
                          `Страница: ${pageNumber}\n` +
                          `URL: ${url}\n` +
                          `Всего капч: ${this.captchaCount}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
                          `⚠️ Парсер пытается обойти капчу...`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления о капче:`, telegramError.message);
        }
    }

    /**
     * Получение списка объявлений
     */
    async* getListings(context) {
        let attempt = 0;
        let currentPage = 1;
        this.stats.startTime = Date.now();
        this.stats.totalPages = 0;
        this.stats.totalListings = 0;
        this.stats.errors = 0;

        // Отправляем уведомление о старте парсинга списка
        if (telegramService.getStatus().enabled) {
            await this.sendProgressNotification('start', currentPage, 0);
        }

        while (attempt < this.config.maxRetries) {
            const page = await context.newPage();

            try {
                // Настраиваем заголовки для каждой страницы
                await page.setExtraHTTPHeaders({
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Referer': this.config.baseUrl || 'https://www.carswitch.com',
                    'Origin': this.config.baseUrl || 'https://www.carswitch.com'
                });

                console.log("🔍 Открываем каталог Carswitch...");

                while (true) {
                    const url = `${this.config.listingsUrl}?page=${currentPage}`;
                    console.log(`📄 Загружаем страницу: ${url}`);

                    // Добавляем случайную задержку перед загрузкой страницы (имитация человеческого поведения)
                    const randomDelay = Math.floor(Math.random() * 2000) + 1000; // 1-3 секунды
                    await this.sleep(randomDelay);

                    await page.goto(url, { 
                        waitUntil: "domcontentloaded", // Используем domcontentloaded для быстрой загрузки
                        timeout: 60000 
                    });

                    // Ждем немного для загрузки контента
                    await page.waitForTimeout(2000);

                    // Проверяем наличие капчи (Amazon WAF или reCAPTCHA)
                    const canContinue = await this.handleCaptcha(page, url, currentPage);
                    if (!canContinue) {
                        console.warn(`⚠️ Пропускаем страницу ${currentPage} из-за капчи`);
                        currentPage++;
                        // Увеличиваем задержку перед следующей страницей
                        await this.sleep(5000);
                        continue;
                    }

                    // Ждем загрузки страницы
                    await page.waitForTimeout(3000);

                    // Скроллим страницу для подгрузки всех карточек (более реалистично)
                    await this.autoScroll(page);
                    
                    // Добавляем случайную задержку после скролла
                    const scrollDelay = Math.floor(Math.random() * 1500) + 1000; // 1-2.5 секунды
                    await page.waitForTimeout(scrollDelay);

                    // Ищем объявления с основным селектором
                    let carLinks = [];
                    
                    try {
                        // Проверяем наличие контейнера с объявлениями
                        const listingContainer = await page.$(this.listingSelector);
                        if (listingContainer) {
                            carLinks = await page.$$eval(
                                this.listingStemSelector,
                                (anchors) => anchors.map((a) => a.href).filter(Boolean)
                            );
                            
                            if (carLinks.length > 0) {
                                console.log(`✅ Найдено ${carLinks.length} объявлений с основным селектором`);
                            }
                        }
                    } catch (error) {
                        console.log("⚠️ Ошибка при поиске объявлений:", error.message);
                    }

                    if (carLinks.length === 0) {
                        console.warn(`⚠️ На странице ${currentPage} не найдено объявлений`);
                        
                        // Если объявления не найдены, завершаем парсинг и переходим к следующему модулю
                        console.log(`✅ Завершаем парсинг Carswitch, переход к следующему модулю`);
                        
                        if (telegramService.getStatus().enabled) {
                            await this.sendProgressNotification('end', currentPage, this.stats.totalListings);
                        }
                        return;
                    }

                    console.log(`✅ Найдено ${carLinks.length} объявлений на странице ${currentPage}`);
                    
                    // Обновляем статистику
                    this.stats.totalPages = currentPage;
                    this.stats.totalListings += carLinks.length;
                    
                    // Логируем первые несколько ссылок для отладки
                    if (carLinks.length > 0 && currentPage <= 3) {
                        console.log(`🔗 Первые 3 ссылки на странице ${currentPage}:`);
                        carLinks.slice(0, 3).forEach((link, index) => {
                            console.log(`   ${index + 1}. ${link}`);
                        });
                    }

                    // Отправляем уведомление в Telegram каждые N страниц
                    if (telegramService.getStatus().enabled && currentPage % this.telegramNotificationInterval === 0) {
                        await this.sendProgressNotification('progress', currentPage, this.stats.totalListings);
                    }

                    for (const link of carLinks) {
                        yield link;
                    }
                    currentPage++;
                }

                break; // Успешно завершили парсинг
            } catch (error) {
                console.error(`❌ Ошибка при парсинге страницы ${currentPage}:`, error);
                this.stats.errors++;
                attempt++;
                
                // Отправляем уведомление об ошибке в Telegram
                if (telegramService.getStatus().enabled) {
                    await this.sendErrorNotification(currentPage, error, 'unknown', attempt >= this.config.maxRetries);
                }
                
                if (attempt >= this.config.maxRetries) {
                    throw error;
                }
                
                console.log(`🔄 Повторная попытка ${attempt}/${this.config.maxRetries}...`);
                await this.sleep(this.config.retryDelay);
            } finally {
                await page.close();
            }
        }
    }

    /**
     * Отправка уведомления о прогрессе в Telegram
     */
    async sendProgressNotification(type, page, listingsCount) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const duration = this.stats.startTime 
                ? Math.round((Date.now() - this.stats.startTime) / 1000 / 60) 
                : 0;

            let message = '';
            
            if (type === 'start') {
                message = `🚀 *Carswitch: Начало парсинга*\n\n` +
                         `Страница: ${page}\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'progress') {
                message = `📊 *Carswitch: Прогресс парсинга*\n\n` +
                         `Страниц обработано: ${page}\n` +
                         `Объявлений найдено: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.errors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'end') {
                message = `✅ *Carswitch: Парсинг завершен*\n\n` +
                         `Всего страниц: ${page}\n` +
                         `Всего объявлений: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.errors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            }

            if (message) {
                await telegramService.sendMessage(message);
            }
        } catch (error) {
            console.warn(`⚠️ Ошибка отправки уведомления в Telegram:`, error.message);
        }
    }

    /**
     * Отправка уведомления об ошибке в Telegram
     */
    async sendErrorNotification(page, error, url = 'unknown', isCritical = false) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const emoji = isCritical ? '🚨' : '⚠️';
            const message = `${emoji} *Carswitch: Ошибка парсинга*\n\n` +
                          `Страница: ${page}\n` +
                          `Ошибка: ${error.name || 'Unknown'}\n` +
                          `Сообщение: ${error.message}\n` +
                          (url !== 'unknown' ? `URL: ${url}\n` : '') +
                          `Всего ошибок: ${this.stats.errors}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления об ошибке:`, telegramError.message);
        }
    }

    /**
     * Автоматический скролл для подгрузки контента
     */
    async autoScroll(page) {
        await page.evaluate(async (scrollContainers) => {
            const container = scrollContainers.find(c => document.querySelector(c) !== null);
            if (!container) return;

            const scrollElement = document.querySelector(container);
            if (!scrollElement) return;

            await new Promise((resolve) => {
                let lastScrollHeight = 0;
                let attemptsWithoutChange = 0;

                const interval = setInterval(() => {
                    scrollElement.scrollBy(0, 300);

                    const currentHeight = scrollElement.scrollHeight;
                    if (currentHeight !== lastScrollHeight) {
                        attemptsWithoutChange = 0;
                        lastScrollHeight = currentHeight;
                    } else {
                        attemptsWithoutChange++;
                    }

                    // остановка после 3 "пустых" скроллов
                    if (attemptsWithoutChange >= 3) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 400);
            });
        }, this.scrollContainers);
    }

    /**
     * Утилита для паузы
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { CarswitchListingParser };
