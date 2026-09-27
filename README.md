# TE IG Assist

**دستیار حرفه‌ای اینستاگرام** با قابلیت پاسخ‌گویی خودکار، مرورگر داخلی و حافظه هوشمند.

## ویژگی‌ها (نسخه فعلی)

- ✅ اپلیکیشن Electron با React 19 + TypeScript + Vite
- ✅ مرورگر داخلی اینستاگرام (WebView با partition جداگانه برای کوکی‌ها)
- ✅ لایه‌بندی دو بخشی: چپ اینستاگرام، راست پنل تنظیمات/حافظه
- ✅ پنل‌های قابل resize با `react-resizable-panels`
- ✅ فونت وزیرمتن + پشتیبانی کامل RTL
- ✅ طراحی مینیمال مدرن تاریک با انیمیشن‌های ظریف (Framer Motion)
- ✅ System Tray (اجرا در پس‌زمینه)
- ✅ حافظه (Memory) قابل ذخیره برای مبنای پاسخ‌های خودکار
- ✅ دکمه فعال/غیرفعال کردن پاسخ‌گویی خودکار

## نقشه راه

- [ ] تشخیص پیام‌های جدید در دایرکت اینستاگرام (MutationObserver + inject script)
- [ ] تولید پاسخ بر اساس حافظه (rule-based در فاز اول، سپس LLM)
- [ ] ارسال خودکار پاسخ
- [ ] مدیریت چند حساب
- [ ] تاریخچه گفتگوها
- [ ] تم روشن/تاریک
- [ ] آپدیت خودکار

## شروع توسعه

```bash
# نصب وابستگی‌ها
npm install

# اجرای حالت توسعه
npm run dev

# بیلد
npm run build

# پکیج ویندوز / مک / لینوکس
npm run build:win
npm run build:mac
npm run build:linux
```

## ساختار پروژه

```
src/
  main/          # Electron main process (window, tray, store)
  preload/       # Secure bridge
  renderer/      # React UI
    src/
      components/
      lib/
      assets/
```

## تکنولوژی‌ها

- Electron 33
- React 19 + TypeScript 5.7
- electron-vite
- Tailwind CSS 3
- Framer Motion
- react-resizable-panels
- electron-store
- Vazirmatn font

---

ساخته شده با ❤️ برای جامعه فارسی‌زبان
