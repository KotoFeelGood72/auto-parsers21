const axios = require('axios');
const { telegramService } = require('./TelegramService');

/**
 * Сервис для решения капчи
 * Поддерживает несколько провайдеров: 2captcha, Anti-Captcha, CapSolver
 */
class CaptchaService {
    constructor() {
        this.provider = process.env.CAPTCHA_PROVIDER || '2captcha'; // 2captcha, anticaptcha, capsolver
        this.apiKey = process.env.CAPTCHA_API_KEY || '';
        this.enabled = this.apiKey && this.apiKey.length > 0;
        
        // API endpoints для разных провайдеров
        this.endpoints = {
            '2captcha': {
                submit: 'http://2captcha.com/in.php',
                getResult: 'http://2captcha.com/res.php'
            },
            'anticaptcha': {
                submit: 'https://api.anti-captcha.com/createTask',
                getResult: 'https://api.anti-captcha.com/getTaskResult'
            },
            'capsolver': {
                submit: 'https://api.capsolver.com/createTask',
                getResult: 'https://api.capsolver.com/getTaskResult'
            }
        };
        
        if (!this.enabled) {
            console.warn('⚠️ CaptchaService отключен: не указан CAPTCHA_API_KEY');
        } else {
            console.log(`✅ CaptchaService инициализирован с провайдером: ${this.provider}`);
        }
    }

    /**
     * Решение Amazon WAF капчи через 2captcha
     */
    async solveAmazonWAF(page, url) {
        if (!this.enabled) {
            console.warn('⚠️ CaptchaService отключен, пропускаем решение капчи');
            return false;
        }

        try {
            console.log(`🔐 Начинаем решение Amazon WAF капчи через ${this.provider}...`);
            
            // Получаем sitekey из страницы
            const siteKey = await this.extractAmazonWAFSiteKey(page);
            if (!siteKey) {
                console.warn('⚠️ Не удалось найти sitekey для Amazon WAF');
                return false;
            }

            console.log(`🔑 Найден sitekey: ${siteKey}`);

            // Отправляем капчу на решение
            let taskId;
            if (this.provider === '2captcha') {
                taskId = await this.solveWith2Captcha(siteKey, url, 'amazon_waf');
            } else if (this.provider === 'anticaptcha') {
                taskId = await this.solveWithAntiCaptcha(siteKey, url, 'AmazonWafTask');
            } else if (this.provider === 'capsolver') {
                taskId = await this.solveWithCapSolver(siteKey, url, 'AmazonAwsWafTask');
            } else {
                console.error(`❌ Неподдерживаемый провайдер: ${this.provider}`);
                return false;
            }

            if (!taskId) {
                console.error('❌ Не удалось создать задачу на решение капчи');
                return false;
            }

            console.log(`📝 Задача создана, ID: ${taskId}. Ожидаем решения...`);

            // Ожидаем решения капчи
            const solution = await this.waitForSolution(taskId);
            if (!solution) {
                console.error('❌ Не удалось получить решение капчи');
                return false;
            }

            console.log(`✅ Получено решение капчи!`);

            // Вводим решение на странице
            const success = await this.submitSolution(page, solution);
            
            if (success) {
                console.log(`✅ Капча успешно решена и отправлена!`);
                await page.waitForTimeout(3000); // Ждем обработки
                return true;
            } else {
                console.error('❌ Не удалось отправить решение капчи');
                return false;
            }

        } catch (error) {
            console.error(`❌ Ошибка при решении капчи:`, error.message);
            
            // Отправляем уведомление в Telegram
            if (telegramService.getStatus().enabled) {
                await this.sendErrorNotification(url, error);
            }
            
            return false;
        }
    }

    /**
     * Извлечение sitekey для Amazon WAF
     */
    async extractAmazonWAFSiteKey(page) {
        try {
            const siteKey = await page.evaluate(() => {
                // Ищем sitekey в скриптах или атрибутах
                const scripts = Array.from(document.querySelectorAll('script'));
                for (const script of scripts) {
                    const content = script.textContent || script.innerHTML;
                    if (content.includes('sitekey') || content.includes('site-key')) {
                        const match = content.match(/sitekey['":\s]*['"]?([a-zA-Z0-9_-]+)['"]?/i);
                        if (match && match[1]) {
                            return match[1];
                        }
                    }
                }
                
                // Ищем в data-атрибутах
                const captchaContainer = document.querySelector('#captcha-container');
                if (captchaContainer) {
                    const dataSiteKey = captchaContainer.getAttribute('data-sitekey');
                    if (dataSiteKey) return dataSiteKey;
                }
                
                return null;
            });
            
            return siteKey;
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения sitekey:`, error.message);
            return null;
        }
    }

    /**
     * Решение через 2captcha
     */
    async solveWith2Captcha(siteKey, pageUrl, method = 'amazon_waf') {
        try {
            const response = await axios.post(this.endpoints['2captcha'].submit, null, {
                params: {
                    key: this.apiKey,
                    method: method,
                    pageurl: pageUrl,
                    sitekey: siteKey,
                    json: 1
                },
                timeout: 10000
            });

            if (response.data.status === 1) {
                return response.data.request;
            } else {
                console.error(`❌ Ошибка 2captcha: ${response.data.request}`);
                return null;
            }
        } catch (error) {
            console.error(`❌ Ошибка отправки в 2captcha:`, error.message);
            return null;
        }
    }

    /**
     * Решение через Anti-Captcha
     */
    async solveWithAntiCaptcha(siteKey, pageUrl, taskType = 'AmazonWafTask') {
        try {
            const response = await axios.post(
                this.endpoints['anticaptcha'].submit,
                {
                    clientKey: this.apiKey,
                    task: {
                        type: taskType,
                        websiteURL: pageUrl,
                        awsKey: siteKey,
                        awsIv: '',
                        awsContext: '',
                        awsChallengeJS: '',
                        awsChallengeVersion: '',
                        awsChallengeType: ''
                    }
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                }
            );

            if (response.data.errorId === 0) {
                return response.data.taskId;
            } else {
                console.error(`❌ Ошибка Anti-Captcha: ${response.data.errorDescription}`);
                return null;
            }
        } catch (error) {
            console.error(`❌ Ошибка отправки в Anti-Captcha:`, error.message);
            return null;
        }
    }

    /**
     * Решение через CapSolver
     */
    async solveWithCapSolver(siteKey, pageUrl, taskType = 'AmazonAwsWafTask') {
        try {
            const response = await axios.post(
                this.endpoints['capsolver'].submit,
                {
                    clientKey: this.apiKey,
                    task: {
                        type: taskType,
                        websiteURL: pageUrl,
                        awsKey: siteKey
                    }
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                }
            );

            if (response.data.errorId === 0) {
                return response.data.taskId;
            } else {
                console.error(`❌ Ошибка CapSolver: ${response.data.errorDescription || response.data.errorCode}`);
                return null;
            }
        } catch (error) {
            console.error(`❌ Ошибка отправки в CapSolver:`, error.message);
            return null;
        }
    }

    /**
     * Ожидание решения капчи
     */
    async waitForSolution(taskId, maxWaitTime = 120000) {
        const startTime = Date.now();
        const checkInterval = 3000; // Проверяем каждые 3 секунды

        while (Date.now() - startTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));

            try {
                let solution = null;
                
                if (this.provider === '2captcha') {
                    solution = await this.get2CaptchaResult(taskId);
                } else if (this.provider === 'anticaptcha') {
                    solution = await this.getAntiCaptchaResult(taskId);
                } else if (this.provider === 'capsolver') {
                    solution = await this.getCapSolverResult(taskId);
                }

                if (solution) {
                    return solution;
                }

                console.log(`⏳ Ожидаем решения... (${Math.round((Date.now() - startTime) / 1000)}с)`);
            } catch (error) {
                console.warn(`⚠️ Ошибка проверки решения:`, error.message);
            }
        }

        console.error(`❌ Превышено время ожидания решения капчи (${maxWaitTime / 1000}с)`);
        return null;
    }

    /**
     * Получение результата от 2captcha
     */
    async get2CaptchaResult(taskId) {
        try {
            const response = await axios.get(this.endpoints['2captcha'].getResult, {
                params: {
                    key: this.apiKey,
                    action: 'get',
                    id: taskId,
                    json: 1
                },
                timeout: 5000
            });

            if (response.data.status === 1) {
                return response.data.request; // Токен решения
            } else if (response.data.request === 'CAPCHA_NOT_READY') {
                return null; // Еще не готово
            } else {
                console.error(`❌ Ошибка получения результата 2captcha: ${response.data.request}`);
                return null;
            }
        } catch (error) {
            console.warn(`⚠️ Ошибка запроса результата 2captcha:`, error.message);
            return null;
        }
    }

    /**
     * Получение результата от Anti-Captcha
     */
    async getAntiCaptchaResult(taskId) {
        try {
            const response = await axios.post(
                this.endpoints['anticaptcha'].getResult,
                {
                    clientKey: this.apiKey,
                    taskId: taskId
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                }
            );

            if (response.data.status === 'ready') {
                return response.data.solution.token || response.data.solution.gRecaptchaResponse;
            } else if (response.data.status === 'processing') {
                return null; // Еще обрабатывается
            } else {
                console.error(`❌ Ошибка Anti-Captcha: ${response.data.errorDescription}`);
                return null;
            }
        } catch (error) {
            console.warn(`⚠️ Ошибка запроса результата Anti-Captcha:`, error.message);
            return null;
        }
    }

    /**
     * Получение результата от CapSolver
     */
    async getCapSolverResult(taskId) {
        try {
            const response = await axios.post(
                this.endpoints['capsolver'].getResult,
                {
                    clientKey: this.apiKey,
                    taskId: taskId
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                }
            );

            if (response.data.status === 'ready') {
                return response.data.solution.token || response.data.solution.awsWafToken;
            } else if (response.data.status === 'processing') {
                return null; // Еще обрабатывается
            } else {
                console.error(`❌ Ошибка CapSolver: ${response.data.errorDescription || response.data.errorCode}`);
                return null;
            }
        } catch (error) {
            console.warn(`⚠️ Ошибка запроса результата CapSolver:`, error.message);
            return null;
        }
    }

    /**
     * Отправка решения на страницу
     */
    async submitSolution(page, solution) {
        try {
            // Для Amazon WAF нужно ввести токен в скрытое поле или вызвать callback
            const success = await page.evaluate((token) => {
                try {
                    // Пробуем найти поле для токена
                    const tokenInput = document.querySelector('input[name="token"], input[name="captcha-token"], #token');
                    if (tokenInput) {
                        tokenInput.value = token;
                        tokenInput.dispatchEvent(new Event('input', { bubbles: true }));
                        tokenInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // Пробуем вызвать callback функции
                    if (window.CaptchaScript && typeof window.CaptchaScript.submitCaptcha === 'function') {
                        window.CaptchaScript.submitCaptcha(token);
                        return true;
                    }

                    // Пробуем найти и кликнуть кнопку отправки
                    const submitButton = document.querySelector('button[type="submit"], #amzn-captcha-verify-button');
                    if (submitButton) {
                        submitButton.click();
                        return true;
                    }

                    return false;
                } catch (e) {
                    console.error('Ошибка отправки решения:', e);
                    return false;
                }
            }, solution);

            return success;
        } catch (error) {
            console.error(`❌ Ошибка отправки решения на страницу:`, error.message);
            return false;
        }
    }

    /**
     * Отправка уведомления об ошибке в Telegram
     */
    async sendErrorNotification(url, error) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const message = `🚨 *Ошибка решения капчи*\n\n` +
                          `URL: ${url}\n` +
                          `Провайдер: ${this.provider}\n` +
                          `Ошибка: ${error.message}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления:`, telegramError.message);
        }
    }

    /**
     * Проверка статуса сервиса
     */
    getStatus() {
        return {
            enabled: this.enabled,
            provider: this.provider,
            hasApiKey: !!this.apiKey
        };
    }
}

// Создаем глобальный экземпляр
const captchaService = new CaptchaService();

module.exports = { CaptchaService, captchaService };






