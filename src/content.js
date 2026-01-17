// 1. ФУНКЦИЯ ПАРСИНГА (Адаптирована под AliExpress)
function scrapeData() {
    // Получаем ID заказа из URL (это самое надежное место на этой странице)
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId') || "Nieznany";

    // Пытаемся найти сумму (селекторы могут меняться, поэтому делаем try-catch)
    let priceText = "0.00";
    try {
        // Ищем элементы, похожие на цену (стандартные классы AE)
        const priceEl = document.querySelector('.order-price-bold') ||
            document.querySelector('.money-bold');
        if (priceEl) priceText = priceEl.innerText;
    } catch (e) {}

    // Название (обычно берем из заголовка или статуса, т.к. товаров может быть много)
    const title = `Zamówienie AliExpress #${orderId}`;

    return {
        title: title,
        url: window.location.href,
        price: priceText,
        date: new Date().toLocaleDateString('pl-PL'),
        orderId: orderId, // Дополнительное поле, полезно для PDF
        seller: "AliExpress Seller",
        buyer: "Ty"
    };
}

// 2. ФУНКЦИЯ СОЗДАНИЯ И ВНЕДРЕНИЯ КНОПКИ
function injectButton() {
    // Ищем целевой контейнер по классам из вашего примера
    const targetContainer = document.querySelector('.order-status.order-block');

    // Если контейнера нет ИЛИ кнопка уже добавлена — выходим
    if (!targetContainer || document.getElementById('my-faktura-btn')) {
        return;
    }

    // Создаем кнопку
    const btn = document.createElement("button");
    btn.id = "my-faktura-btn"; // Уникальный ID, чтобы не дублировать
    btn.type = "button";

    // Используем родной класс 'comet-btn', чтобы кнопка была по размеру как остальные
    btn.className = "comet-btn";

    // Добавляем немного своих стилей, чтобы она выделялась (зеленая)
    btn.style.cssText = "margin-left: 10px; background-color: #2e7d32; color: white; border-color: #2e7d32;";

    // Внутренняя структура кнопки (span) как на сайте
    const span = document.createElement("span");
    span.innerText = "Faktura (PDF)";
    btn.appendChild(span);

    // Логика клика
    btn.onclick = () => {
        const originalText = span.innerText;
        span.innerText = "...";
        btn.disabled = true;

        const data = scrapeData();

        // Отправляем сообщение background скрипту
        chrome.runtime.sendMessage({ action: "openGenerator", data: data }, () => {
            // Возвращаем кнопку в исходное состояние
            span.innerText = originalText;
            btn.disabled = false;
        });
    };

    // Вставляем кнопку в конец контейнера (после кнопки "Paragon")
    targetContainer.appendChild(btn);
    console.log("Кнопка Faktura успешно добавлена!");
}

// 3. НАБЛЮДАТЕЛЬ (MutationObserver)
// AliExpress подгружает контент динамически (React). 
// Нам нужно следить за изменениями страницы, чтобы вставить кнопку, когда появится блок.
const observer = new MutationObserver((mutations) => {
    // При каждом изменении DOM проверяем, не появился ли наш блок
    injectButton();
});

// Запускаем наблюдение за всем телом страницы
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// На случай, если элемент уже есть (при перезагрузке расширения)
injectButton();