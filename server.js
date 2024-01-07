import {Readable} from 'stream';
import * as readline from 'node:readline/promises';
import express from 'express';
import {decode} from 'windows-1252';
import fs from 'fs';
import PDFDocument from "pdfkit";
import bodyParser from 'body-parser';
//import { getPrinters, print } from "unix-print";

const PORT = 65139;
const app = express();

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(bodyParser.json());

function getJsonOfArticlesData() {
    return new Promise((resolve, reject) => {
        let articles = [];
        fs.readFile('./files/ExportMaquette.txt', (err, input) => {
            if (err) throw err;
            const text = decode(input);
            //Create a stream from the string, this is to be able to read the file line by line
            let s = new Readable.from(text);
            const rl = readline.createInterface(s);

            rl.on('line', (chunk) => {
                try {
                    const regex = /^([A-Za-z])(\d{1,3})([A-Za-z]?);(\d+[,.]?\d*);(.+?);/;
                    const result = regex.exec(chunk);
                    if (result == null) {//End of the data we need
                        resolve(articles);
                    } else {
                        articles.push({
                            alpha: result[1],
                            number: result[2],
                            subAlpha: result[3],
                            price: result[4],
                            name: result[5]
                        });
                    }
                } catch (e) {
                    reject(`Couldn't get List of articles in regex parsing: ${e}`);
                }
            })
        });
    });
}

app.get('/articles', async (req, res) => {
    let articlesData = await getJsonOfArticlesData();
    res.send(articlesData);
});

const pdfPath = "./files/pdf/ticket_to_print.pdf";

app.post('/print-order', async (req, res) => {
    console.log(req.body);
    const order = req.body;
    await createPdfOfOrder(order);
    console.log("pdf fini (après la promesse)");
    // setTimeout(()=>{
	// const printer = "Quai_Printer";
    //     print(pdfPath, printer).then(console.log);
    //     getPrinters().then(console.log);
    //     res.sendStatus(200);
	// }, 3000);
});

function createPdfOfOrder(order) {
    return new Promise((resolve, reject)=>{
        try{
            const doc = new PDFDocument({
                size: [160.0, 320.0], margins: {
                    top: 10,
                    bottom: 10,
                    left: 10,
                    right: 10
                }
            });
            doc.pipe(fs.createWriteStream(pdfPath));
            doc.fontSize(8);
            doc.image('./files/images/logo.png', {fit: [60, 75], align: 'center', valign: 'top'});
            doc.font('Courier-Bold').text(`\nTable ${order["tableNumber"]}`, {
                continued: true,
                align: 'left'
            }).text(`${order["date"]}`, {align: 'right'});
            doc.moveDown();

            doc.font('Courier-Bold').text(`Q  Ref`, {continued: true, align: 'left'}).text(`Prix U`, {
                continued: true,
                align: 'center'
            }).text(`Total`, {align: 'right'});
            doc.moveDown();

            let greatTotal = 0;
            let promotionList = [...order["unlinkedPromotions"]];
            //Puts all orderElements to the PDF (and add all linked promotions to the promotionList too)
            order["orderElements"].forEach((orderElement) => {
                if (orderElement["hasPromotion"]) {
                    promotionList.push(orderElement["promotion"]);
                }

                const article = orderElement["article"];
                const articleRef = `${article["alpha"]}${article["number"]}${article["subAlpha"]}`;
                const totalForArticle = article["price"] * orderElement["quantity"] + orderElement["extraPrice"];
                greatTotal += totalForArticle;
                doc
                    .font('Courier-Bold')
                    .text(`${orderElement["quantity"]}  ${articleRef}`, {
                        continued: true,
                        align: 'left'
                    }).text(`${article["price"]}€`, {
                    continued: true,
                    align: 'center'
                }).text(`${totalForArticle}€`, {align: 'right'});
                const comment = orderElement["comment"];
                const commentIsExtra = orderElement["commentIsExtra"];
                const extraPrice = orderElement["extraPrice"];
                if (comment !== "") {
                    doc.font('Courier-Bold').text(` ${commentIsExtra ? "Supplément" : "Commentaire"}: ${comment}`, {continued: true}).text(`${commentIsExtra ? "+" + extraPrice + "€" : ""}`, {align: 'right'});
                    doc.moveDown();
                }
            })

            if (promotionList.length > 0) {
                doc.moveDown();
                doc.font('Courier-Bold').text(`${"*".repeat(8)}Promotions${"*".repeat(8)}`);
                doc.moveDown();
                promotionList.forEach((promotion) => {
                    const discountValue = promotion["discountValue"];
                    greatTotal -= discountValue;
                    doc.font('Courier-Bold').text(`${promotion["name"]}`, {
                        continued: true,
                        align: 'left'
                    }).text(`-${discountValue}€`, {align: 'right'});
                });
            }

            if (order["paymentMethod"] === "cash") {
                greatTotal *= 0.9;
            }

            doc.moveDown();
            doc.font('Courier-Bold').text(`${"=".repeat(8)}Grand Total${"=".repeat(8)}`);
            doc.font('Courier-Bold').text(`Réglé par ${order["paymentMethod"]} :`, {
                continued: true,
                align: 'left'
            }).text(`${greatTotal}€`, {align: 'right'});
            doc.end();
	    console.log("pd finished from promise");
            resolve("Pdf finished from promise");
        }catch (e) {
            reject("Error creating pdf: " + e);
        }
    });
}

app.listen(PORT, () => {
    console.log("App listening and ready to serve your articles.");
})
