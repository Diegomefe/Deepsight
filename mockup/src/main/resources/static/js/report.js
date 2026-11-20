/* Local PDF report builder for the DeepSight prototype. No network calls. */
(() => {
    'use strict';

    const PAGE_WIDTH = 595;
    const PAGE_HEIGHT = 842;
    const MARGIN = 48;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    const COLORS = {
        ink:[.125,.192,.212],
        muted:[.459,.506,.529],
        light:[.886,.91,.914],
        teal:[.141,.475,.431],
        tealSoft:[.918,.957,.945],
        guinda:[.47,.169,.278],
        paper:[.961,.969,.973],
        white:[1,1,1],
        warning:[.996,.965,.955],
        warningLine:[.937,.847,.816],
        warningText:[.54,.31,.24]
    };
    const WIN_ANSI = {
        '€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,
        'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,
        '–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159
    };

    function clean(value) {
        return String(value ?? '')
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/[\u0000-\u001F]/g, '')
            .replace(/\u00A0/g, ' ')
            .trim();
    }

    function pdfString(value) {
        const normalized = clean(value)
            .replace(/→/g, '->')
            .replace(/←/g, '<-')
            .replace(/−/g, '-')
            .replace(/≥/g, '>=')
            .replace(/≤/g, '<=');
        let out = '';
        for (const character of normalized) {
            let code = WIN_ANSI[character] ?? character.codePointAt(0);
            if (code > 255) code = 63;
            const encoded = String.fromCharCode(code);
            out += encoded === '(' || encoded === ')' || encoded === '\\' ? `\\${encoded}` : encoded;
        }
        return `(${out})`;
    }

    function latin1(value) {
        const out = new Uint8Array(value.length);
        for (let i = 0; i < value.length; i++) {
            const code = value.charCodeAt(i);
            out[i] = code <= 255 ? code : 63;
        }
        return out;
    }

    function number(value) {
        return String(Math.round(value * 100) / 100);
    }

    function color(values) {
        return values.map(value => number(value)).join(' ');
    }

    function textWidth(value, size, bold = false) {
        return clean(value).length * size * (bold ? .53 : .49);
    }

    function truncate(value, maxWidth, size) {
        const cleanValue = clean(value);
        if (textWidth(cleanValue, size) <= maxWidth) return cleanValue;
        let cut = cleanValue;
        while (cut.length > 1 && textWidth(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
        return `${cut}…`;
    }

    function wrap(value, maxWidth, size) {
        const maxChars = Math.max(10, Math.floor(maxWidth / (size * .5)));
        const words = clean(value).split(/\s+/).filter(Boolean);
        const lines = [];
        let line = '';
        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (candidate.length <= maxChars) {
                line = candidate;
                continue;
            }
            if (line) lines.push(line);
            if (word.length > maxChars) {
                for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
                line = '';
            } else {
                line = word;
            }
        }
        if (line) lines.push(line);
        return lines;
    }

    function text(x, y, size, font, value, fill = COLORS.ink) {
        return `q ${color(fill)} rg BT /${font} ${number(size)} Tf 1 0 0 1 ${number(x)} ${number(y)} Tm ${pdfString(value)} Tj ET Q\n`;
    }

    function rightText(x, y, size, font, value, fill = COLORS.ink) {
        return text(x - textWidth(value, size, font === 'F2'), y, size, font, value, fill);
    }

    function centerText(x, y, size, font, value, fill = COLORS.ink) {
        return text(x - textWidth(value, size, font === 'F2') / 2, y, size, font, value, fill);
    }

    function line(x1, y1, x2, y2, stroke = COLORS.light, width = .6) {
        return `q ${color(stroke)} RG ${number(width)} w ${number(x1)} ${number(y1)} m ${number(x2)} ${number(y2)} l S Q\n`;
    }

    function fillRect(x, y, width, height, fill) {
        return `q ${color(fill)} rg ${number(x)} ${number(y)} ${number(width)} ${number(height)} re f Q\n`;
    }

    function strokeRect(x, y, width, height, stroke = COLORS.light, lineWidth = .6) {
        return `q ${color(stroke)} RG ${number(lineWidth)} w ${number(x)} ${number(y)} ${number(width)} ${number(height)} re S Q\n`;
    }

    function drawImage(name, x, y, width, height) {
        return `q ${number(width)} 0 0 ${number(height)} ${number(x)} ${number(y)} cm /${name} Do Q\n`;
    }

    function dataUrlToBytes(dataUrl) {
        const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function renderJpeg(canvas, maxWidth, maxHeight, quality, background, allowUpscale = false) {
        let ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
        if (!allowUpscale) ratio = Math.min(1, ratio);
        const width = Math.max(1, Math.round(canvas.width * ratio));
        const height = Math.max(1, Math.round(canvas.height * ratio));
        const target = document.createElement('canvas');
        target.width = width;
        target.height = height;
        const context = target.getContext('2d');
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
        context.drawImage(canvas, 0, 0, width, height);
        return {bytes:dataUrlToBytes(target.toDataURL('image/jpeg', quality)), width, height};
    }

    function footer(pageNumber, totalPages) {
        return line(MARGIN, 32, PAGE_WIDTH - MARGIN, 32) +
            text(MARGIN, 20, 7, 'F1', 'DeepSight · UPIIZ · Instituto Politécnico Nacional', COLORS.muted) +
            rightText(PAGE_WIDTH - MARGIN, 20, 7, 'F1', `Documento de ejemplo · Página ${pageNumber} de ${totalPages}`, COLORS.muted);
    }

    function pageOne(data, fullImage) {
        const content = [];
        const generated = clean(data.generatedAt);
        content.push(fillRect(0, PAGE_HEIGHT - 68, PAGE_WIDTH, 68, COLORS.tealSoft));
        content.push(text(MARGIN, PAGE_HEIGHT - 42, 21, 'F2', 'DeepSight', COLORS.teal));
        content.push(text(MARGIN, PAGE_HEIGHT - 56, 7.5, 'F1', 'IMAGEN · ANÁLISIS · EXPLORACIÓN', COLORS.muted));
        const badgeWidth = 82;
        const badgeX = PAGE_WIDTH - MARGIN - badgeWidth;
        content.push(fillRect(badgeX, PAGE_HEIGHT - 51, badgeWidth, 18, COLORS.guinda));
        content.push(centerText(badgeX + badgeWidth / 2, PAGE_HEIGHT - 45.5, 7.5, 'F2', 'NO CLÍNICO', COLORS.white));
        content.push(rightText(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 61, 7.5, 'F1', `Generado: ${generated}`, COLORS.muted));
        content.push(text(MARGIN, 742, 17, 'F2', 'Reporte de exploración de mamografía', COLORS.ink));
        content.push(text(MARGIN, 726, 9, 'F1', 'Documento de ejemplo generado localmente desde DeepSight', COLORS.muted));
        content.push(line(MARGIN, 714, PAGE_WIDTH - MARGIN, 714, COLORS.light, .8));

        content.push(fillRect(MARGIN, 610, CONTENT_WIDTH, 94, COLORS.white));
        content.push(strokeRect(MARGIN, 610, CONTENT_WIDTH, 94));
        const leftRows = [
            ['ARCHIVO', truncate(data.fileName, 235, 9)],
            ['DIMENSIONES', `${data.width} × ${data.height} px`],
            ['REPRESENTACIÓN', truncate(data.representation, 235, 8.5)]
        ];
        const rightRows = [
            ['MALLA', `${data.cols} × ${data.rows} · ${data.cols * data.rows} regiones`],
            ['PATCH', `${data.patchSize} × ${data.patchSize} px`],
            ['REGIÓN SELECCIONADA', data.selected.label]
        ];
        [[MARGIN + 10, leftRows], [315, rightRows]].forEach(([x, rows]) => {
            rows.forEach(([label, value], index) => {
                const y = 684 - index * 24;
                content.push(text(x, y, 6.5, 'F2', label, COLORS.muted));
                content.push(text(x, y - 11, 9, 'F1', value, COLORS.ink));
            });
        });

        const imageBox = {x:MARGIN, y:120, width:CONTENT_WIDTH, height:474};
        const scale = Math.min(imageBox.width / fullImage.width, imageBox.height / fullImage.height);
        const imageWidth = fullImage.width * scale;
        const imageHeight = fullImage.height * scale;
        const imageX = imageBox.x + (imageBox.width - imageWidth) / 2;
        const imageY = imageBox.y + (imageBox.height - imageHeight) / 2;
        content.push(fillRect(imageX, imageY, imageWidth, imageHeight, [.06, .10, .12]));
        content.push(drawImage('Im1', imageX, imageY, imageWidth, imageHeight));
        content.push(strokeRect(imageX - .5, imageY - .5, imageWidth + 1, imageHeight + 1, COLORS.light));
        content.push(centerText(imageX + imageWidth / 2, imageY - 12, 7.5, 'F1',
            data.demo ? 'Imagen completa · Vista original · Ejemplo sintético' : 'Imagen completa · Vista original · Archivo local', COLORS.muted));

        content.push(fillRect(MARGIN, 46, CONTENT_WIDTH, 46, COLORS.warning));
        content.push(strokeRect(MARGIN, 46, CONTENT_WIDTH, 46, COLORS.warningLine));
        content.push(text(MARGIN + 10, 76, 6.5, 'F2', 'AVISO', COLORS.guinda));
        const warning = 'Los resultados y las puntuaciones de este reporte son ilustrativos. No constituyen un diagnóstico, no confirman microcalcificaciones (MCC) y no sustituyen la revisión de un especialista.';
        wrap(warning, CONTENT_WIDTH - 110, 7.5).slice(0, 2).forEach((lineText, index) => {
            content.push(text(MARGIN + 62, 76 - index * 11, 7.5, 'F1', lineText, COLORS.warningText));
        });
        content.push(footer(1, 2));
        return content.join('');
    }

    function pageTwo(data, patchImage, histogramImage) {
        const content = [];
        const generated = clean(data.generatedAt);
        content.push(fillRect(0, PAGE_HEIGHT - 54, PAGE_WIDTH, 54, COLORS.tealSoft));
        content.push(text(MARGIN, PAGE_HEIGHT - 33, 13, 'F2', 'DeepSight', COLORS.teal));
        content.push(text(MARGIN, PAGE_HEIGHT - 45, 7, 'F1', 'REPORTE DE EXPLORACIÓN · DETALLE DE REGIÓN', COLORS.muted));
        content.push(rightText(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 33, 7.5, 'F1', generated, COLORS.muted));
        content.push(rightText(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 45, 7, 'F1', 'Documento de ejemplo · No clínico', COLORS.guinda));
        content.push(text(MARGIN, 752, 16, 'F2', 'Detalle de la región seleccionada', COLORS.ink));
        content.push(text(MARGIN, 736, 8.5, 'F1', 'Propiedades calculadas sobre la vista de 8 bits del patch.', COLORS.muted));

        const preview = {x:MARGIN, y:560, width:140, height:140};
        content.push(fillRect(preview.x, preview.y, preview.width, preview.height, [.07, .11, .13]));
        const scale = Math.min(preview.width / patchImage.width, preview.height / patchImage.height);
        const patchWidth = patchImage.width * scale;
        const patchHeight = patchImage.height * scale;
        const patchX = preview.x + (preview.width - patchWidth) / 2;
        const patchY = preview.y + (preview.height - patchHeight) / 2;
        content.push(drawImage('Im2', patchX, patchY, patchWidth, patchHeight));
        content.push(strokeRect(preview.x, preview.y, preview.width, preview.height));
        content.push(text(preview.x, preview.y - 12, 7.5, 'F1',
            `${data.selected.label} · ${data.selected.w} × ${data.selected.h} px`, COLORS.muted));

        const propertiesX = 225;
        content.push(text(propertiesX, 686, 10, 'F2', 'Propiedades', COLORS.ink));
        const properties = [
            ['Región', data.selected.label],
            ['Coordenadas', `x: ${data.selected.x} · y: ${data.selected.y}`],
            ['Tamaño', `${data.selected.w} × ${data.selected.h} px`],
            ['Intensidad media', data.selected.mean === null ? '—' : `${data.selected.mean.toFixed(1)} / 255`],
            ['Desviación estándar', data.selected.std === null ? '—' : data.selected.std.toFixed(1)],
            [data.demo ? 'Puntuación ilustrativa' : 'Puntuación del modelo', data.selected.score === null ? 'No disponible' : data.selected.score.toFixed(2)]
        ];
        properties.forEach(([label, value], index) => {
            const y = 662 - index * 22;
            content.push(text(propertiesX, y, 7.5, 'F1', label, COLORS.muted));
            content.push(rightText(PAGE_WIDTH - MARGIN, y, 8.5, 'F2', value, COLORS.ink));
            content.push(line(propertiesX, y - 8, PAGE_WIDTH - MARGIN, y - 8, COLORS.light, .4));
        });

        content.push(text(MARGIN, 524, 10, 'F2', 'Histograma de intensidad', COLORS.ink));
        content.push(rightText(PAGE_WIDTH - MARGIN, 524, 7.5, 'F1', 'Escala 0–255', COLORS.muted));
        const histogramWidth = 460;
        const histogramHeight = histogramWidth * histogramImage.height / histogramImage.width;
        const histogramX = MARGIN;
        const histogramY = 518 - histogramHeight;
        content.push(fillRect(histogramX, histogramY, histogramWidth, histogramHeight, COLORS.white));
        content.push(drawImage('Im3', histogramX, histogramY, histogramWidth, histogramHeight));
        content.push(strokeRect(histogramX, histogramY, histogramWidth, histogramHeight, COLORS.light));
        content.push(text(histogramX, histogramY - 10, 7, 'F1', '0 · Oscuro', COLORS.muted));
        content.push(rightText(histogramX + histogramWidth, histogramY - 10, 7, 'F1', 'Claro · 255', COLORS.muted));

        content.push(text(MARGIN, 350, 10, 'F2', 'Regiones candidatas', COLORS.ink));
        if (data.demo) {
            content.push(text(MARGIN, 338, 7.5, 'F1', 'Selección ilustrativa para recorrer el flujo de exploración.', COLORS.muted));
            content.push(text(MARGIN, 316, 6.5, 'F2', 'REGIÓN', COLORS.muted));
            content.push(text(140, 316, 6.5, 'F2', 'PATCH', COLORS.muted));
            content.push(text(230, 316, 6.5, 'F2', 'COORDENADAS', COLORS.muted));
            content.push(rightText(PAGE_WIDTH - MARGIN, 316, 6.5, 'F2', 'PUNTUACIÓN', COLORS.muted));
            content.push(line(MARGIN, 310, PAGE_WIDTH - MARGIN, 310, COLORS.light, .7));
            data.candidates.forEach((candidate, index) => {
                const y = 294 - index * 20;
                const selected = candidate.label === data.selected.label;
                const font = selected ? 'F2' : 'F1';
                content.push(text(MARGIN, y, 8.5, font, `Región ${String(index + 1).padStart(2, '0')}`, COLORS.ink));
                content.push(text(140, y, 8.5, font, candidate.label, selected ? COLORS.teal : COLORS.ink));
                content.push(text(230, y, 8.5, 'F1', `x: ${candidate.x} · y: ${candidate.y}`, COLORS.muted));
                content.push(rightText(PAGE_WIDTH - MARGIN, y, 8.5, 'F2', candidate.score.toFixed(2), COLORS.teal));
            });
            content.push(line(MARGIN, 242, PAGE_WIDTH - MARGIN, 242, COLORS.light, .7));
        } else {
            content.push(text(MARGIN, 316, 8.5, 'F2', 'Sin resultados de inferencia.', COLORS.ink));
            wrap('La imagen está disponible para explorar, pero el modelo CNN no está integrado. Esto no indica ausencia de regiones candidatas.', CONTENT_WIDTH, 7.5)
                .forEach((lineText, index) => content.push(text(MARGIN, 298 - index * 11, 7.5, 'F1', lineText, COLORS.muted)));
        }

        content.push(fillRect(MARGIN, 150, CONTENT_WIDTH, 74, COLORS.paper));
        content.push(strokeRect(MARGIN, 150, CONTENT_WIDTH, 74));
        content.push(text(MARGIN + 10, 206, 6.5, 'F2', 'ALCANCE', COLORS.guinda));
        const scope = 'Este reporte no incluye mapas Grad-CAM. Las puntuaciones y regiones candidatas del ejemplo son ilustrativas y no confirman microcalcificaciones (MCC). La imagen, el análisis y este documento se generaron localmente en el navegador.';
        wrap(scope, CONTENT_WIDTH - 100, 7.5).forEach((lineText, index) => {
            content.push(text(MARGIN + 62, 206 - index * 10, 7.5, 'F1', lineText, COLORS.muted));
        });
        content.push(footer(2, 2));
        return content.join('');
    }

    function assemble(pageOneContent, pageTwoContent, images) {
        const chunks = [];
        let length = 0;
        const offsets = new Array(12).fill(0);
        const push = value => {
            const bytes = typeof value === 'string' ? latin1(value) : value;
            chunks.push(bytes);
            length += bytes.length;
        };
        const object = (id, body) => {
            offsets[id] = length;
            push(`${id} 0 obj\n`);
            body();
            push('endobj\n');
        };
        const stream = (id, dictionary, content) => {
            const bytes = latin1(content);
            object(id, () => {
                push(`<<${dictionary} /Length ${bytes.length} >>\nstream\n`);
                push(bytes);
                push('\nendstream\n');
            });
        };
        const image = (id, value) => {
            object(id, () => {
                push(`<< /Type /XObject /Subtype /Image /Width ${value.width} /Height ${value.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${value.bytes.length} >>\nstream\n`);
                push(value.bytes);
                push('\nendstream\n');
            });
        };

        push('%PDF-1.4\n');
        push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
        object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>\n'));
        object(2, () => push('<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\n'));
        object(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /ProcSet [/PDF /Text /ImageC] /Font << /F1 7 0 R /F2 8 0 R >> /XObject << /Im1 9 0 R /Im2 10 0 R /Im3 11 0 R >> >> /Contents 4 0 R >>\n`));
        stream(4, '', pageOneContent);
        object(5, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /ProcSet [/PDF /Text /ImageC] /Font << /F1 7 0 R /F2 8 0 R >> /XObject << /Im1 9 0 R /Im2 10 0 R /Im3 11 0 R >> >> /Contents 6 0 R >>\n`));
        stream(6, '', pageTwoContent);
        object(7, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n'));
        object(8, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n'));
        image(9, images.full);
        image(10, images.patch);
        image(11, images.histogram);

        const xrefStart = length;
        push('xref\n0 12\n0000000000 65535 f \n');
        for (let id = 1; id <= 11; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
        push(`trailer\n<< /Size 12 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

        const output = new Uint8Array(length);
        let position = 0;
        for (const chunk of chunks) {
            output.set(chunk, position);
            position += chunk.length;
        }
        return output;
    }

    function reportFileName(originalName) {
        const base = clean(originalName)
            .replace(/\.png$/i, '')
            .replace(/[^\w-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 40) || 'estudio';
        const now = new Date();
        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        return `DeepSight_reporte_${base}_${stamp}.pdf`;
    }

    function build(data) {
        const full = renderJpeg(data.canvases.original, 1400, 1400, .9, '#000000');
        const patch = renderJpeg(data.canvases.patch, 512, 512, .92, '#10191e', true);
        const histogram = renderJpeg(data.canvases.histogram, 1040, 280, .92, '#ffffff', true);
        const pageOneContent = pageOne(data, full);
        const pageTwoContent = pageTwo(data, patch, histogram);
        return {
            bytes:assemble(pageOneContent, pageTwoContent, {full, patch, histogram}),
            fileName:reportFileName(data.fileName)
        };
    }

    window.DeepSightReport = {build};
})();
