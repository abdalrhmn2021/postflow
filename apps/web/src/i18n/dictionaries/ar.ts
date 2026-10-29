// Every text on the site, in Arabic. en.ts must have exactly the same keys (TypeScript checks it),
// so a new text can't be forgotten in one language.
// Client Components get the parts they need as props (plain strings only, no functions).
export const ar = {
  meta: {
    description: "جدولة منشورات عملائك على فيسبوك وإنستغرام، مع موافقة العميل وكابشنات بالذكاء الاصطناعي.",
  },
  common: {
    languageName: "العربية",
    switchLanguage: "English",
    loading: "جاري التحميل…",
  },
  home: {
    tagline: "منصة جدولة السوشيال ميديا للوكالات",
    title: "خطّط منشورات عملائك على تقويم واحد",
    description:
      "العميل بيوافق على المنشور من رابط، والمنشور بينزل على فيسبوك وإنستغرام بوقته تلقائياً. والكابشنات بيكتبها الذكاء الاصطناعي بأسلوب كل عميل.",
    register: "سجّل وكالتك",
    login: "تسجيل الدخول",
    status: "حالة النظام",
  },
  status: {
    title: "حالة النظام",
    api: "الـ API",
    database: "قاعدة البيانات (PostgreSQL)",
    redis: "Redis",
    worker: "الـ Worker",
    checking: "جاري الفحص…",
    up: "شغّال",
    down: "واقف",
    unreachable: "الـ API مش واصل. شغّله بالأمر:",
  },
  // The API's error codes (apps/api), shown above a form.
  errors: {
    VALIDATION_ERROR: "في حقول ناقصة أو غلط، صلّحها وجرّب مرة ثانية.",
    EMAIL_TAKEN: "هاد الإيميل إله حساب.",
    SLUG_TAKEN: "اسم الرابط هاد مستخدم، اختار اسم ثاني.",
    INVALID_CREDENTIALS: "الإيميل أو كلمة السر غلط.",
    TOO_MANY_ATTEMPTS: "محاولات دخول كثير، استنى دقيقة وجرّب مرة ثانية.",
    UNAUTHENTICATED: "لازم تسجّل دخول.",
    FORBIDDEN: "دورك ما بيسمحلك تعمل هاد.",
    BRAND_NOT_FOUND: "العميل مش موجود.",
    BRAND_NAME_TAKEN: "عندك عميل بنفس الاسم.",
    INVALID_EDITORS: "لازم يكون كل واحد محرر بوكالتك.",
    INVITE_INVALID: "رابط الدعوة غلط أو انستخدم أو انتهى.",
    INVITE_NOT_FOUND: "الدعوة مش موجودة.",
    STAFF_NOT_FOUND: "الموظف مش موجود.",
    CANNOT_CHANGE_OWNER: "ما بنقدر نغيّر أو نشيل صاحب الوكالة.",
    NETWORK_ERROR: "ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرّب مرة ثانية.",
    UNKNOWN: "صار خطأ غير متوقع. جرّب مرة ثانية.",
  },
  // The API's messages under each field (VALIDATION_ERROR -> fields). {n} is a number.
  fields: {
    required: "مطلوب",
    atLeast: "{n} أحرف على الأقل",
    atMost: "{n} حرف كحد أقصى",
    invalidEmail: "الإيميل مش صحيح",
    slugChars: "أحرف إنجليزية صغيرة وأرقام وشرطات (-) بس",
    language: "لازم تكون عربي أو إنجليزي",
    timezone: "المنطقة الزمنية مش معروفة",
    nothingToChange: "ما في إشي تغيّره",
    role: "لازم يكون مدير أو محرر",
    invalid: "القيمة مش صحيحة",
  },
};

export type Dictionary = typeof ar;
