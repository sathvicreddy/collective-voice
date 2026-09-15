const fs = require('fs');
let c = fs.readFileSync('frontend/public/js/pages/auth.js', 'utf8');

c = c.replace(/<div class="auth-form">/g, '<form class="auth-form" data-submit="authSubmit">');
c = c.replace(/<div class="mobile-auth-form">/g, '<form class="mobile-auth-form" data-submit="authSubmit">');
c = c.replace(/<div class="mobile-auth-form" id="reset-form">/g, '<form class="mobile-auth-form" id="reset-form" data-submit="authReset">');

// For the first form (desktop)
let idx1 = c.indexOf('<form class="auth-form" data-submit="authSubmit">');
let firstPart = c.substring(0, idx1);
let remaining = c.substring(idx1);
let close1 = remaining.indexOf('</div>\n        </div>\n      </div>\n    </div>\n\n    <!-- ===== MOBILE AUTH (hidden on desktop) ===== -->');
if (close1 !== -1) {
    let beforeClose = remaining.substring(0, close1);
    let afterClose = remaining.substring(close1 + 6); // length of </div>
    remaining = beforeClose + '</form>' + afterClose;
    c = firstPart + remaining;
}

// For the second form (mobile)
let idx2 = c.indexOf('<form class="mobile-auth-form" data-submit="authSubmit">');
let firstPart2 = c.substring(0, idx2);
let remaining2 = c.substring(idx2);
let close2 = remaining2.indexOf('</div>\n      </div>\n    </div>\n  `;\n}');
if (close2 !== -1) {
    let beforeClose2 = remaining2.substring(0, close2);
    let afterClose2 = remaining2.substring(close2 + 6);
    remaining2 = beforeClose2 + '</form>' + afterClose2;
    c = firstPart2 + remaining2;
}

// For forgot password (it has <div class="mobile-auth-form"> but wait, it uses data-action="authForgot")
// Ah! In authForgot:
// <div class="mobile-auth-form">
// ...
// <button class="auth-submit-btn" data-action="authForgot">Send Reset Link</button>
// So it needs data-submit="authForgot".
// Wait, the replace above changed all to data-submit="authSubmit".
// I'll fix the forgot password one manually in the string.

fs.writeFileSync('frontend/public/js/pages/auth.js', c);
