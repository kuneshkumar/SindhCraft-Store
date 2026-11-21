const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 800;
export function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const isHttpUrl = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
function linkAttrs(link) {
    if (!link)
        return null;
    if (isHttpUrl(link.url)) {
        const rel = ["noopener", "noreferrer"];
        if (link.rel?.nofollow)
            rel.push("nofollow");
        if (link.rel?.sponsored)
            rel.push("sponsored");
        if (link.rel?.ugc)
            rel.push("ugc");
        const target = link.target === "BLANK" ? ` target="_blank"` : "";
        return `href="${escapeHtml(link.url)}" rel="${rel.join(" ")}"${target}`;
    }
    if (typeof link.anchor === "string" && link.anchor)
        return `href="#${escapeHtml(link.anchor)}"`;
    return null;
}
function textNodeToHtml(node) {
    let html = escapeHtml(String(node.textData?.text ?? ""));
    for (const d of (node.textData?.decorations ?? [])) {
        switch (d?.type) {
            case "BOLD":
                if (typeof d.fontWeightValue !== "number" || d.fontWeightValue >= 600)
                    html = `<strong>${html}</strong>`;
                break;
            case "ITALIC":
                if (d.italicData !== false)
                    html = `<em>${html}</em>`;
                break;
            case "UNDERLINE":
                html = `<u>${html}</u>`;
                break;
            case "STRIKETHROUGH":
                html = `<s>${html}</s>`;
                break;
            case "SUPERSCRIPT":
                html = `<sup>${html}</sup>`;
                break;
            case "SUBSCRIPT":
                html = `<sub>${html}</sub>`;
                break;
            case "LINK": {
                const attrs = linkAttrs(d.linkData?.link);
                if (attrs)
                    html = `<a ${attrs}>${html}</a>`;
                break;
            }
            case "ANCHOR":
                if (typeof d.anchorData?.anchor === "string" && d.anchorData.anchor)
                    html = `<a href="#${escapeHtml(d.anchorData.anchor)}">${html}</a>`;
                break;
            default:
                break;
        }
    }
    return html;
}
export function imageValue(image) {
    const src = image?.src;
    if (!src)
        return "";
    if (typeof src.id === "string" && src.id) {
        const size = image?.width && image?.height ? `#originWidth=${image.width}&originHeight=${image.height}` : "";
        return `wix:image://v1/${src.id}/${src.id}${size}`;
    }
    return isHttpUrl(src.url) ? src.url : "";
}
function imgTag(image, alt, ctx) {
    const src = ctx.imgSrc(imageValue(image), ctx.width, ctx.height);
    if (!src)
        return "";
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(String(alt ?? ""))}" loading="lazy" decoding="async">`;
}
function childrenToHtml(node, ctx) {
    return (node.nodes ?? []).map((n) => nodeToHtml(n, ctx)).join("");
}
function nodeToHtml(node, ctx) {
    switch (node?.type) {
        case "TEXT": return textNodeToHtml(node);
        case "PARAGRAPH": return `<p>${childrenToHtml(node, ctx)}</p>`;
        case "HEADING": {
            const level = Math.min(6, Math.max(1, Math.round(ctx.headingLevel(Number(node.headingData?.level) || 2))));
            return `<h${level}>${childrenToHtml(node, ctx)}</h${level}>`;
        }
        case "BULLETED_LIST": return `<ul>${childrenToHtml(node, ctx)}</ul>`;
        case "ORDERED_LIST": return `<ol>${childrenToHtml(node, ctx)}</ol>`;
        case "LIST_ITEM": return `<li>${childrenToHtml(node, ctx)}</li>`;
        case "BLOCKQUOTE": return `<blockquote>${childrenToHtml(node, ctx)}</blockquote>`;
        case "CODE_BLOCK": return `<pre><code>${childrenToHtml(node, ctx)}</code></pre>`;
        case "DIVIDER": return "<hr>";
        case "TABLE": return `<table><tbody>${childrenToHtml(node, ctx)}</tbody></table>`;
        case "TABLE_ROW": return `<tr>${childrenToHtml(node, ctx)}</tr>`;
        case "TABLE_CELL": return `<td>${childrenToHtml(node, ctx)}</td>`;
        case "IMAGE": {
            const img = imgTag(node.imageData?.image, node.imageData?.altText, ctx);
            if (!img)
                return "";
            const attrs = linkAttrs(node.imageData?.link);
            return attrs ? `<a ${attrs}>${img}</a>` : img;
        }
        case "GALLERY": {
            const imgs = (node.galleryData?.items ?? [])
                .map((item) => imgTag(item?.image?.media, item?.altText ?? item?.title, ctx))
                .filter(Boolean);
            return imgs.length ? `<figure>${imgs.join("")}</figure>` : "";
        }
        case "VIDEO": {
            const url = node.videoData?.video?.src?.url;
            if (!isHttpUrl(url))
                break;
            const label = escapeHtml(String(node.videoData?.title || url));
            return `<p><a href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">${label}</a></p>`;
        }
        default:
            break;
    }
    const text = nodeToText(node).trim();
    return text ? `<p>${escapeHtml(text)}</p>` : "";
}
export function richContentToHtml(rc, imgSrc, options = {}) {
    const ctx = {
        imgSrc,
        headingLevel: options.headingLevel ?? ((level) => Math.max(2, level)),
        width: options.imageWidth ?? IMAGE_WIDTH,
        height: options.imageHeight ?? IMAGE_HEIGHT,
    };
    return (rc?.nodes ?? []).map((n) => nodeToHtml(n, ctx)).join("");
}
const INLINE_TYPES = new Set(["TEXT"]);
function nodeToText(node) {
    if (node?.type === "TEXT")
        return String(node.textData?.text ?? "");
    if (node?.type === "BUTTON")
        return String(node.buttonData?.text ?? "");
    const children = (node?.nodes ?? []);
    const parts = children.map(nodeToText);
    return children.every((c) => INLINE_TYPES.has(c?.type)) ? parts.join("") : parts.filter(Boolean).join("\n");
}
export function richContentToText(rc) {
    return (rc?.nodes ?? []).map(nodeToText).filter(Boolean).join("\n").trim();
}
