# دليل DevCheckpoint بالعربية

أداة محلية صغيرة لحماية العمل قبل تطبيق ملفات patch على مستودع Git. تحفظ الملفات المتتبعة والمعدلة وغير المتتبعة والمتجاهلة، ثم تجرب التغييرات في نسخة مؤقتة وتتحقق من البصمات قبل السماح بالتطبيق الفعلي.

لا تحتاج إلى حساب OpenAI أو مفتاح API أو Codex. ويمكن لأي مساعد برمجي تشغيلها من الطرفية وفق صلاحيات المستخدم.

## التشغيل

تحتاج إلى Node.js 24 أو أحدث وGit. وعلى Windows تحتاج أيضاً إلى Windows PowerShell وicacls. لا توجد تبعيات npm وقت التشغيل.

```sh
node bin/devcheckpoint.mjs --help
npm test
npm run example
```

## التسلسل الآمن

1. أوقف عمليات البناء والمراقبة وأي برنامج يكتب إلى المستودع.
2. نفّذ `plan` لفحص المستودع وترتيب ملفات patch وعرض أوامر التحقق. لا يغيّر المستودع الأصلي.
3. نفّذ `backup` مع مجلد جديد خارج المستودع. النسخة تحتوي على الملفات المتجاهلة أيضاً، وقد تحتوي على أسرار؛ لا تنشرها.
4. راجع أوامر التحقق ثم وافق صراحة باستخدام `--approve-commands` لتشغيل `rehearse`.
5. بعد نجاح التجربة وموافقة صاحب المشروع، نفّذ `apply --confirm --approve-commands`.
6. للتراجع عن هذه العملية استخدم `restore --confirm`. إذا ظهرت تعديلات أحدث، تتوقف الأداة ولا تمحوها تلقائياً.

```sh
node bin/devcheckpoint.mjs plan --repo "C:\Projects\example-app" --patch "C:\Changes\change.patch"
node bin/devcheckpoint.mjs backup --repo "C:\Projects\example-app" --backup-dir "C:\Recovery\before-change"
node bin/devcheckpoint.mjs rehearse --repo "C:\Projects\example-app" --backup-dir "C:\Recovery\before-change" --patch "C:\Changes\change.patch"
node bin/devcheckpoint.mjs apply --repo "C:\Projects\example-app" --backup-dir "C:\Recovery\before-change" --confirm
node bin/devcheckpoint.mjs restore --repo "C:\Projects\example-app" --backup-dir "C:\Recovery\before-change" --confirm
```

المثال أعلاه يفحص التغييرات فقط؛ لا يدّعي تنفيذ اختبارات للمشروع. أضف ملف إعدادات `--config` في التخطيط والتجربة لتشغيل اختبارات فعلية. راجع مثال `examples/checks.json`.

## حدود مهمة

- نسخة التجربة ليست بيئة أمنية معزولة. الأوامر تعمل بصلاحياتك وقد تستخدم الشبكة، لذلك تتطلب موافقة صريحة.
- يجب ألا تغيّر أوامر التحقق ملفات المستودع. اجعل مخرجات البناء خارج المستودع.
- يدعم الإصدار الأول مستودعات Git العادية ذات مجلد `.git` مستقل والتغييرات على الملفات العادية. لا يدعم submodules أو linked worktrees أو أنواع الملفات الخاصة.
- يسجل الروابط دون تتبع أهدافها، لكنه يرفض التجربة والتطبيق عندما يحتوي المستودع على روابط.
- يُرفض أي اختلاف غير معروف أو اختبار ناقص أو ملف دليل مفقود. لا تكفي نتيجة خروج صفر لإثبات أن الاختبارات نُفذت.
- قد يتطلب انقطاع الاستعادة أو وجود كتابة جزئية معالجة يدوية باستخدام النسخة المحفوظة. لا يوجد خيار لإجبار الاستبدال.
- نتائج التوافق الفعلية موجودة في `docs/verification.md`. لا ندّعي اختبار Linux أو macOS في هذه النسخة.

راجع README.md وSECURITY.md وLIMITATIONS.md قبل الاستخدام على مشروع حقيقي. لا تنشر النسخ الاحتياطية أو السجلات الخاصة.
