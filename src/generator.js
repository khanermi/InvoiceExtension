document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['invoice_buyer_config', 'tempInvoiceData'], (result) => {

        const buyerConfig = result.invoice_buyer_config || { name: "", taxId: "", addressFull: "" };
        const parsedData = result.tempInvoiceData || { lineItems: [], parsedTotalStr: "0" };

        // 1. Обработка товаров
        let calculatedItems = (parsedData.lineItems || []).map(item => {
            const vatRate = 0; // Пока 0%
            const totalGross = item.totalGrossPrice;
            // Netto = Gross (при 0% VAT)
            return {
                ...item,
                netUnitPrice: item.grossUnitPrice,
                vatRate: vatRate,
                totalNet: totalGross,
                totalVat: 0,
                totalGross: totalGross
            };
        });

        // 2. Считаем сумму товаров
        const itemsSum = calculatedItems.reduce((acc, item) => acc + item.totalGross, 0);

        // 3. Парсим ИТОГОВУЮ цену со страницы (Suma)
        const totalOrderPrice = parseFloat((parsedData.parsedTotalStr || "0").replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

        // 4. Вычисляем разницу (Доставка или Скидка)
        // Difference = Итого (со страницы) - Сумма товаров
        const difference = totalOrderPrice - itemsSum;

        // Если разница положительная (например, +15 zł) -> это Доставка
        if (difference > 0.01) {
            calculatedItems.push({
                description: "Koszt dostawy (Shipping)",
                quantity: 1,
                grossUnitPrice: difference,
                netUnitPrice: difference,
                vatRate: 0,
                totalNet: difference,
                totalVat: 0,
                totalGross: difference
            });
        }
        // Если разница отрицательная (например, -5 zł) -> это Скидка
        else if (difference < -0.01) {
            calculatedItems.push({
                description: "Rabat / Kupon (Discount)",
                quantity: 1,
                grossUnitPrice: difference, // Будет с минусом
                netUnitPrice: difference,
                vatRate: 0,
                totalNet: difference,
                totalVat: 0,
                totalGross: difference
            });
        }

        // 5. Финальные итоги
        const finalTotals = calculatedItems.reduce((acc, item) => {
            return {
                totalNet: acc.totalNet + item.totalNet,
                totalVat: acc.totalVat + item.totalVat,
                totalGross: acc.totalGross + item.totalGross
            };
        }, { totalNet: 0, totalVat: 0, totalGross: 0 });


        // 6. Сборка объекта для PDF
        const invoiceData = {
            invoiceHeader: {
                invoiceNumber: parsedData.orderId ? `FV-${parsedData.orderId}` : `FV-${Date.now()}`,
                orderId: parsedData.orderId || "---",
                issueDate: new Date().toISOString().slice(0, 10),
                saleDate: parsedData.saleDate || new Date().toISOString().slice(0, 10)
            },
            seller: {
                name: parsedData.sellerName || "AliExpress Seller",
                addressFull: "AliExpress Platform",
                taxId: ""
            },
            buyer: buyerConfig,
            lineItems: calculatedItems,
            totals: finalTotals,
            sourceUrl: parsedData.url
        };

        window.currentInvoiceData = invoiceData;

        // Заполнение UI
        document.getElementById('seller').value = `${invoiceData.seller.name}\n${invoiceData.seller.addressFull}`;
        document.getElementById('buyer').value = `${invoiceData.buyer.name}\nNIP: ${invoiceData.buyer.taxId}\n${invoiceData.buyer.addressFull}`;
        document.getElementById('date').value = invoiceData.invoiceHeader.issueDate;
        document.getElementById('sourceUrl').value = invoiceData.sourceUrl;

        // Показываем сумму в инпуте для проверки
        document.getElementById('price').value = invoiceData.totals.totalGross.toFixed(2);
        if (invoiceData.lineItems.length > 0) {
            document.getElementById('itemName').value = `${invoiceData.lineItems[0].description} ... (+${invoiceData.lineItems.length - 1} poz.)`;
        }
    });

    // 7. Генерация PDF
    document.getElementById('generatePdfBtn').addEventListener('click', () => {
        const data = window.currentInvoiceData;

        const tableBody = [
            [
                { text: 'Nazwa towaru / usługi', style: 'tableHeader' },
                { text: 'Il.', style: 'tableHeader' },
                { text: 'Cena', style: 'tableHeader' },
                { text: 'Wartość', style: 'tableHeader' }
            ]
        ];

        data.lineItems.forEach(item => {
            tableBody.push([
                { text: item.description, fontSize: 9 },
                { text: item.quantity.toString(), alignment: 'center' },
                { text: item.grossUnitPrice.toFixed(2), alignment: 'right' },
                { text: item.totalGross.toFixed(2), alignment: 'right', bold: true }
            ]);
        });

        const docDefinition = {
            content: [
                { text: 'FAKTURA', style: 'header', alignment: 'right' },
                { text: `Nr: ${data.invoiceHeader.invoiceNumber}`, alignment: 'right', bold: true },
                { text: `Data: ${data.invoiceHeader.issueDate}`, alignment: 'right', margin: [0,0,0,20] },

                // Колонки продавца/покупателя
                {
                    columns: [
                        { width: '*', text: [{text:'Sprzedawca:\n',style:'label'}, {text:data.seller.name+'\n',bold:true}, data.seller.addressFull] },
                        { width: '*', text: [{text:'Nabywca:\n',style:'label'}, {text:data.buyer.name+'\n',bold:true}, `NIP: ${data.buyer.taxId}\n`, data.buyer.addressFull], alignment: 'right' }
                    ]
                },
                { text: '\n\n' },

                // Таблица
                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 'auto', 'auto', 'auto'],
                        body: tableBody
                    },
                    layout: 'lightHorizontalLines'
                },
                { text: '\n' },

                // ИТОГИ
                {
                    columns: [
                        { width: '*', text: '' },
                        {
                            width: 'auto',
                            table: {
                                body: [
                                    [{ text: 'RAZEM (Suma):', bold: true }, { text: `${data.totals.totalGross.toFixed(2)} PLN`, bold: true, fontSize: 12 }]
                                ]
                            },
                            layout: 'noBorders'
                        }
                    ]
                },
                { text: `\nID Zamówienia: ${data.invoiceHeader.orderId}`, fontSize: 9, color: 'gray', margin: [0,20,0,0] },
                { text: `Źródło: ${data.sourceUrl}`, fontSize: 8, color: 'gray', link: data.sourceUrl }
            ],
            styles: {
                header: { fontSize: 22, bold: true },
                label: { fontSize: 10, color: 'gray', italics: true },
                tableHeader: { bold: true, fontSize: 11, fillColor: '#f0f0f0' }
            },
            defaultStyle: { fontSize: 10 }
        };

        try {
            pdfMake.createPdf(docDefinition).download(`Faktura_${data.invoiceHeader.invoiceNumber}.pdf`);
        } catch (e) {
            console.error(e);
            alert("Błąd generowania PDF!");
        }
    });
});