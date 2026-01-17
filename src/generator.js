document.addEventListener('DOMContentLoaded', () => {
    // 1. Загружаем сохраненные настройки покупателя и спаршенные данные заказа
    chrome.storage.local.get(['invoice_buyer_config', 'tempInvoiceData'], (result) => {

        // --- ПОДГОТОВКА ДАННЫХ (MAPPING) ---

        // А. Данные покупателя (из настроек расширения)
        const buyerConfig = result.invoice_buyer_config || {
            name: "[Nie ustawiono w opcjach]",
            taxId: "",
            addressFull: ""
        };

        // Б. Данные заказа (спаршенные с сайта)
        const parsedData = result.tempInvoiceData || {
            title: "Towar", price: "0", date: new Date().toLocaleDateString(), url: ""
        };

        // В. Очистка цены (превращаем "150,00 zł" в число 150.00)
        // Убираем все кроме цифr, запятой и точки. Меняем запятую на точку.
        const cleanPriceStr = (parsedData.price || "0").replace(/[^0-9.,]/g, '').replace(',', '.');
        const unitPrice = parseFloat(cleanPriceStr) || 0;

        // Г. Собираем полную структуру JSON (как вы просили)
        const invoiceData = {
            invoiceHeader: {
                invoiceNumber: parsedData.orderId ? `FV-${parsedData.orderId}` : `FV-${Date.now()}`,
                orderId: parsedData.orderId || "---",
                issueDate: new Date().toISOString().slice(0, 10), // Сегодня YYYY-MM-DD
                saleDate: parsedData.date || new Date().toISOString().slice(0, 10)
            },
            seller: {
                name: parsedData.seller || "AliExpress Seller",
                addressFull: "Via AliExpress Platform",
                taxId: "PL0000000000" // Заглушка, так как NIP продавца сложно парсить
            },
            buyer: {
                name: buyerConfig.name,
                addressFull: buyerConfig.addressFull,
                taxId: buyerConfig.taxId
            },
            lineItems: [
                {
                    description: parsedData.title,
                    quantity: 1,
                    netUnitPrice: unitPrice, // Для упрощения считаем это нетто (или брутто, зависит от учета)
                    vatRate: "23%",
                    grossUnitPrice: unitPrice,
                    totalGrossPrice: unitPrice
                }
            ],
            totals: {
                totalGross: unitPrice
            },
            sourceUrl: parsedData.url
        };

        // --- ЗАПОЛНЕНИЕ ФОРМЫ (UI) ---
        // Заполняем инпуты, чтобы пользователь видел, что пойдет в PDF

        // Блок продавца
        document.getElementById('seller').value =
            `${invoiceData.seller.name}\n${invoiceData.seller.addressFull}`;

        // Блок покупателя
        document.getElementById('buyer').value =
            `${invoiceData.buyer.name}\nNIP: ${invoiceData.buyer.taxId}\n${invoiceData.buyer.addressFull}`;

        // Товар
        document.getElementById('itemName').value = invoiceData.lineItems[0].description;
        document.getElementById('price').value = invoiceData.lineItems[0].grossUnitPrice.toFixed(2);
        document.getElementById('date').value = invoiceData.invoiceHeader.issueDate;
        document.getElementById('sourceUrl').value = invoiceData.sourceUrl;

        // Сохраняем собранные данные в глобальную переменную, чтобы кнопка "Скачать" их видела
        window.currentInvoiceData = invoiceData;
    });

    // 2. ГЕНЕРАЦИЯ PDF
    document.getElementById('generatePdfBtn').addEventListener('click', () => {
        // Берем актуальные данные (вдруг пользователь поправил инпуты руками? 
        // Для простоты берем пока из переменной, но можно читать обратно из инпутов)
        const data = window.currentInvoiceData;

        // Если пользователь поменял цену в инпуте, обновим её
        const currentPrice = document.getElementById('price').value;

        // Структура документа для pdfMake
        const docDefinition = {
            content: [
                { text: 'FAKTURA VAT', style: 'header', alignment: 'right' },
                { text: `Nr: ${data.invoiceHeader.invoiceNumber}`, alignment: 'right', bold: true },
                { text: `Data wystawienia: ${data.invoiceHeader.issueDate}`, alignment: 'right', margin: [0,0,0,20] },

                // Две колонки: Продавец и Покупатель
                {
                    columns: [
                        {
                            width: '*',
                            text: [
                                {text: 'Sprzedawca (Seller):\n', style: 'label'},
                                {text: data.seller.name + '\n', bold: true},
                                data.seller.addressFull
                            ]
                        },
                        {
                            width: '*',
                            text: [
                                {text: 'Nabywca (Buyer):\n', style: 'label'},
                                {text: data.buyer.name + '\n', bold: true},
                                `NIP: ${data.buyer.taxId}\n`,
                                data.buyer.addressFull
                            ],
                            alignment: 'right'
                        }
                    ]
                },
                { text: '\n\n' },

                // Таблица товаров
                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 'auto', 'auto', 'auto'],
                        body: [
                            // Заголовки
                            [
                                {text:'Nazwa towaru / usługi', style: 'tableHeader'},
                                {text:'Ilość', style: 'tableHeader'},
                                {text:'Cena', style: 'tableHeader'},
                                {text:'Wartość', style: 'tableHeader'}
                            ],
                            // Строка товара
                            [
                                data.lineItems[0].description,
                                data.lineItems[0].quantity,
                                currentPrice, // Используем цену из инпута
                                currentPrice
                            ]
                        ]
                    },
                    layout: 'lightHorizontalLines'
                },

                { text: '\n' },

                // Итого
                {
                    columns: [
                        { width: '*', text: '' },
                        {
                            width: 'auto',
                            table: {
                                body: [
                                    [ {text: 'RAZEM:', bold:true}, {text: `${currentPrice} PLN`, bold:true} ]
                                ]
                            },
                            layout: 'noBorders'
                        }
                    ]
                },

                { text: `\nID Zamówienia: ${data.invoiceHeader.orderId}`, fontSize: 10, color: 'gray', margin: [0,20,0,0] },
                { text: `Źródło: ${data.sourceUrl}`, fontSize: 8, color: 'gray', link: data.sourceUrl }
            ],
            styles: {
                header: { fontSize: 22, bold: true },
                label: { fontSize: 10, color: 'gray', italics: true },
                tableHeader: { bold: true, fontSize: 12, fillColor: '#f0f0f0' }
            },
            defaultStyle: {
                fontSize: 10
            }
        };

        // Генерация и скачивание
        try {
            pdfMake.createPdf(docDefinition).download(`Faktura_${data.invoiceHeader.invoiceNumber}.pdf`);
        } catch (e) {
            console.error(e);
            alert("Błąd generowania PDF! Sprawdź konsolę (F12).");
        }
    });
});