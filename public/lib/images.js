import { imageTiles } from "./domain.js";
function readImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image(),
      url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片无法读取，请选择相册中的 PNG、JPG 或 WebP 截图。"));
    };
    img.src = url;
  });
}
export async function prepareImages(files, onProgress = () => {}) {
  const prepared = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      throw new Error("请选择 PNG、JPG 或 WebP 图片。HEIC 请先导出为 JPG。");
    if (file.size > 20 * 1024 * 1024)
      throw new Error("单张截图不能超过 20 MB，请先缩小图片。");
    const img = await readImage(file),
      tiles = imageTiles(img.naturalWidth, img.naturalHeight),
      slices = [];
    for (const tile of tiles) {
      const canvas = document.createElement("canvas");
      canvas.width = tile.width;
      canvas.height = tile.outputHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("浏览器无法处理图片，请关闭其他页面后重试。");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        img,
        0,
        tile.y,
        img.naturalWidth,
        tile.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      slices.push(canvas.toDataURL("image/jpeg", 0.83));
      canvas.width = canvas.height = 1;
    }
    const thumb = document.createElement("canvas");
    thumb.width = 180;
    thumb.height = 220;
    thumb
      .getContext("2d")
      .drawImage(
        img,
        0,
        0,
        img.naturalWidth,
        Math.min(img.naturalHeight, (img.naturalWidth * 220) / 180),
        0,
        0,
        180,
        220,
      );
    prepared.push({
      id: crypto.randomUUID(),
      name: file.name,
      thumbnail: thumb.toDataURL("image/jpeg", 0.75),
      slices,
    });
    onProgress(i + 1, files.length);
  }
  return prepared;
}
