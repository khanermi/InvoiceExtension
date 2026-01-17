// 1. ПАРСИНГ ТОВАРОВ (Список)
function scrapeLineItems() {
    const items = [];
    const itemContainers = document.querySelectorAll('.order-detail-item-content');

    itemContainers.forEach(container => {
        try {
            const titleLink = container.querySelector('.item-title a');
            const titleEl = titleLink || container.querySelector('.item-title');

            const description = titleEl ? titleEl.innerText.trim() : "Towar AliExpress";
            const productUrl = titleLink ? titleLink.href : null;

            const priceEl = container.querySelector('.es--wrap--1Hlfkoj') || container.querySelector('.item-price');
            let rawPrice = "0";
            if (priceEl) {
                rawPrice = priceEl.innerText.replace(/[^\d.,]/g, '').replace(',', '.');
            }
            const grossUnitPrice = parseFloat(rawPrice) || 0;

            const qtyEl = container.querySelector('.item-price-quantity');
            let quantity = 1;
            if (qtyEl) {
                const qtyText = qtyEl.innerText.toLowerCase().replace('x', '').trim();
                quantity = parseInt(qtyText) || 1;
            }

            items.push({
                description: description,
                productUrl: productUrl,
                quantity: quantity,
                grossUnitPrice: grossUnitPrice,
                vatRate: 0,
                totalGrossPrice: grossUnitPrice * quantity
            });

        } catch (e) {
            console.error("Ошибка парсинга товара:", e);
        }
    });

    return items;
}

// ПАРСИНГ ДАТЫ
function getSalesDateFromHTML() {
    try {
        const dateLabel = document.querySelector('[data-pl="order_detail_gray_date"]');
        if (!dateLabel) return null;

        const fullText = dateLabel.parentElement.textContent.trim();
        const monthsPL = {
            'sty': '01', 'lut': '02', 'mar': '03', 'kwi': '04', 'maj': '05', 'cze': '06',
            'lip': '07', 'sie': '08', 'wrz': '09', 'paź': '10', 'lis': '11', 'gru': '12'
        };

        const match = fullText.match(/(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})/i);
        if (match) {
            const day = match[1].padStart(2, '0');
            const monthStr = match[2].toLowerCase();
            const year = match[3];
            const month = monthsPL[monthStr];
            if (day && month && year) return `${year}-${month}-${day}`;
        }
    } catch (e) { console.error(e); }
    return null;
}

// НОВАЯ ФУНКЦИЯ: Асинхронное получение НДС с эмуляцией наведения
async function getVatAmountAsync() {
    // 1. Сначала попробуем найти, вдруг уже открыто
    let vatVal = parseVatFromDom();
    if (vatVal > 0) return vatVal;

    // 2. Ищем иконку вопроса рядом с "Wliczono podatek VAT"
    // Обычно она идет сразу после текста, либо внутри того же блока
    // Попробуем найти span с текстом "Wliczono podatek VAT"
    const allSpans = Array.from(document.querySelectorAll('span'));
    const vatLabel = allSpans.find(s => s.textContent && s.textContent.includes('Wliczono podatek VAT'));

    if (vatLabel) {
        // Иконка обычно следующий элемент или внутри родителя
        let icon = vatLabel.querySelector('.comet-icon-help');
        if (!icon) icon = vatLabel.nextElementSibling?.querySelector('.comet-icon-help') || vatLabel.nextElementSibling;

        // Если нашли иконку — "наводим" мышь
        if (icon) {
            console.log("Эмулируем наведение на иконку VAT...");

            // События мыши для триггера React/Tooltip
            const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
            const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window });

            icon.dispatchEvent(mouseOverEvent);
            icon.dispatchEvent(mouseEnterEvent);

            // Ждем 500 мс пока отрисуется попап
            await new Promise(resolve => setTimeout(resolve, 500));

            // Пробуем парсить снова
            vatVal = parseVatFromDom();

            // (Опционально) Убираем мышь, чтобы попап не висел, хотя это не критично
            const mouseOut = new MouseEvent('mouseout', { bubbles: true });
            icon.dispatchEvent(mouseOut);
        }
    }

    return vatVal || 0;
}

// Хелпер: ищет текст в DOM
function parseVatFromDom() {
    try {
        // Ищем во всех попапах
        const hintContents = document.querySelectorAll('.popover-hint-content, .comet-popover-content');
        for (let container of hintContents) {
            // Ищем строку "Podatek VAT: X,XX"
            const text = container.textContent || "";
            if (text.includes("Podatek VAT")) {
                // Извлекаем цену. Пример: "Podatek VAT: 5,63zł"
                // Регулярка ищет число после двоеточия
                const match = text.match(/Podatek VAT:\s*([\d,.\s]+)/);
                if (match) {
                    const cleanPrice = match[1].replace(/[^\d.,]/g, '').replace(',', '.');
                    return parseFloat(cleanPrice) || 0;
                }
            }
        }
    } catch (e) { console.error(e); }
    return 0;
}

// 2. ГЛАВНАЯ ФУНКЦИЯ (Теперь ASYNC)
async function scrapeData() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId') || "---";

    let totalOrderPrice = "0";
    try {
        const targetPriceEls = document.querySelectorAll('.rightPriceClass');
        if (targetPriceEls.length > 0) {
            totalOrderPrice = targetPriceEls[targetPriceEls.length - 1].innerText;
        } else {
            const fallbackEls = document.querySelectorAll('.order-price-bold');
            if (fallbackEls.length > 0) {
                totalOrderPrice = fallbackEls[fallbackEls.length - 1].innerText;
            }
        }
    } catch (e) { console.error(e); }

    const parsedDate = getSalesDateFromHTML();

    // ЖДЕМ получение НДС
    const parsedVat = await getVatAmountAsync();

    return {
        orderId: orderId,
        saleDate: parsedDate || new Date().toISOString().slice(0, 10),
        sellerName: "AliExpress Seller",
        lineItems: scrapeLineItems(),
        parsedTotalStr: totalOrderPrice,
        totalVat: parsedVat,
        url: window.location.href
    };
}

// 3. ВНЕДРЕНИЕ КНОПКИ
function injectButton() {
    const targetContainer = document.querySelector('.order-status.order-block');
    if (!targetContainer || document.getElementById('my-faktura-btn')) return;

    const btn = document.createElement("button");
    btn.id = "my-faktura-btn";
    btn.type = "button";
    btn.className = "comet-btn";
    btn.style.cssText = "margin-left: 10px; background-color: #2e7d32; color: white; border-color: #2e7d32;";

    const span = document.createElement("span");
    span.innerText = "Faktura (PDF)";
    btn.appendChild(span);

    // ОБРАБОТЧИК теперь ASYNC
    btn.onclick = async () => {
        const originalText = span.innerText;
        span.innerText = "Pobieranie..."; // Индикатор работы, пока ждем 0.5 сек
        btn.disabled = true;

        try {
            // Ждем завершения скрапинга (включая ожидание попапа)
            const data = await scrapeData();

            chrome.runtime.sendMessage({ action: "openGenerator", data: data }, () => {
                span.innerText = originalText;
                btn.disabled = false;
            });
        } catch (e) {
            console.error("Ошибка сбора данных:", e);
            span.innerText = "Błąd!";
            setTimeout(() => { span.innerText = originalText; btn.disabled = false; }, 2000);
        }
    };

    targetContainer.appendChild(btn);
}

const observer = new MutationObserver((mutations) => {
    injectButton();
});
observer.observe(document.body, { childList: true, subtree: true });
injectButton();