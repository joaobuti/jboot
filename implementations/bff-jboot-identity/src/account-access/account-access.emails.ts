import { MailMessage } from '../mail/mail.service';

/**
 * Textos dos e-mails de acesso (docs/product/account-access-email-sprints.md). Nunca levam senha:
 * so o login, o link de uso unico e a validade.
 */

export function maskDocument(documentType: string, digits: string): string {
  if (documentType === 'cnpj' && digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return digits;
}

interface AccessEmailInput {
  to: string;
  displayName: string;
  login: string;
  link: string;
  validity: string;
}

export function inviteEmail(input: AccessEmailInput): MailMessage {
  const subject = 'Seu acesso à JBoot';
  const lines = [
    `Olá, ${input.displayName}.`,
    'Sua conta na JBoot foi criada. Para entrar, crie a sua senha pelo link abaixo.',
    `Login: ${input.login} (o mesmo documento informado no cadastro)`,
    `Criar senha: ${input.link}`,
    `O link vale por ${input.validity} e só pode ser usado uma vez. Se ele vencer, peça um novo a quem fez o seu cadastro.`
  ];
  return {
    to: input.to,
    subject,
    text: lines.join('\n\n'),
    html: layout({
      title: 'Seu acesso à JBoot',
      paragraphs: [
        `Olá, ${escapeHtml(input.displayName)}.`,
        'Sua conta na JBoot foi criada. Para entrar, crie a sua senha pelo botão abaixo.',
        `<strong>Login:</strong> ${escapeHtml(input.login)} (o mesmo documento informado no cadastro)`
      ],
      button: { label: 'Criar minha senha', href: input.link },
      footer: `O link vale por ${input.validity} e só pode ser usado uma vez. Se ele vencer, peça um novo a quem fez o seu cadastro.`
    })
  };
}

export function passwordResetEmail(input: AccessEmailInput): MailMessage {
  const subject = 'Redefinição de senha da JBoot';
  const lines = [
    `Olá, ${input.displayName}.`,
    'Recebemos um pedido para redefinir a senha da sua conta na JBoot.',
    `Login: ${input.login}`,
    `Redefinir senha: ${input.link}`,
    `O link vale por ${input.validity} e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.`
  ];
  return {
    to: input.to,
    subject,
    text: lines.join('\n\n'),
    html: layout({
      title: 'Redefinição de senha',
      paragraphs: [
        `Olá, ${escapeHtml(input.displayName)}.`,
        'Recebemos um pedido para redefinir a senha da sua conta na JBoot.',
        `<strong>Login:</strong> ${escapeHtml(input.login)}`
      ],
      button: { label: 'Redefinir minha senha', href: input.link },
      footer: `O link vale por ${input.validity} e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.`
    })
  };
}

function layout(input: { title: string; paragraphs: string[]; button: { label: string; href: string }; footer: string }): string {
  const href = escapeHtml(input.button.href);
  return [
    '<div style="background:#f3f6f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#212529">',
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">',
    '<div style="background:#0f1a24;padding:16px 24px;color:#22d3ee;font-size:20px;font-weight:bold">JBoot</div>',
    '<div style="padding:24px">',
    `<h2 style="margin:0 0 16px;font-size:18px">${escapeHtml(input.title)}</h2>`,
    ...input.paragraphs.map((paragraph) => `<p style="margin:0 0 12px;line-height:1.5">${paragraph}</p>`),
    `<p style="margin:24px 0"><a href="${href}" style="background:#0891b2;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${escapeHtml(input.button.label)}</a></p>`,
    `<p style="margin:0 0 12px;font-size:13px;color:#6c757d">Se o botão não abrir, copie o endereço: <br><span style="word-break:break-all">${href}</span></p>`,
    `<p style="margin:0;font-size:13px;color:#6c757d">${escapeHtml(input.footer)}</p>`,
    '</div></div></div>'
  ].join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
