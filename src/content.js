// 1. ПАРСИНГ ТОВАРОВ (Список)
function scrapeLineItems() {
    const items = [];
    const itemContainers = document.querySelectorAll('.order-detail-item-content');

    itemContainers.forEach(container => {
        try {
            // Ищем элемент названия. Если это ссылка <a>, берем href
            const titleLink = container.querySelector('.item-title a');
            const titleEl = titleLink || container.querySelector('.item-title');

            const description = titleEl ? titleEl.innerText.trim() : "Towar AliExpress";
            // Сохраняем ссылку на товар
            const productUrl = titleLink ? titleLink.href : null;

            // Цена
            const priceEl = container.querySelector('.es--wrap--1Hlfkoj') || container.querySelector('.item-price');
            let rawPrice = "0";
            if (priceEl) {
                rawPrice = priceEl.innerText.replace(/[^\d.,]/g, '').replace(',', '.');
            }
            const grossUnitPrice = parseFloat(rawPrice) || 0;

            // Количество
            const qtyEl = container.querySelector('.item-price-quantity');
            let quantity = 1;
            if (qtyEl) {
                const qtyText = qtyEl.innerText.toLowerCase().replace('x', '').trim();
                quantity = parseInt(qtyText) || 1;
            }

            items.push({
                description: description,
                productUrl: productUrl, // <-- Добавили поле
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

// НОВАЯ ФУНКЦИЯ: Парсинг даты заказа
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

            if (day && month && year) {
                return `${year}-${month}-${day}`;
            }
        }
    } catch (e) {
        console.error("Ошибка парсинга даты:", e);
    }
    return null;
}

// 2. ГЛАВНАЯ ФУНКЦИЯ СБОРА ДАННЫХ
function scrapeData() {
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
    } catch (e) {
        console.error("Не удалось найти общую цену", e);
    }

    const parsedDate = getSalesDateFromHTML();

    return {
        orderId: orderId,
        saleDate: parsedDate || new Date().toISOString().slice(0, 10),
        sellerName: "AliExpress Seller",
        lineItems: scrapeLineItems(), // Теперь товары содержат URL
        parsedTotalStr: totalOrderPrice,
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

    btn.onclick = () => {
        const originalText = span.innerText;
        span.innerText = "Pobieranie...";
        btn.disabled = true;

        const data = scrapeData();

        chrome.runtime.sendMessage({ action: "openGenerator", data: data }, () => {
            span.innerText = originalText;
            btn.disabled = false;
        });
    };

    targetContainer.appendChild(btn);
}

const observer = new MutationObserver((mutations) => {
    injectButton();
});

observer.observe(document.body, { childList: true, subtree: true });
injectButton();