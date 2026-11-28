import type { Locale } from '#/i18n/locale'

export const emailText = {
  en: {
    recipient: 'This email was intended for',
    ignore: 'If you did not request this, you can ignore this email.',
    contact: 'If you do not recognize this, contact your administrator.',
    signSubject: (code: string) => `Your sign-in code is ${code}`,
    signHeading: 'Sign in to Pages CMS',
    signInstruction: 'Enter this temporary verification code to continue:',
    expiry: 'This code will expire in 5 minutes.',
    inviteSubject: (repo: string) => `Join "${repo}"`,
    inviteBody: (person: string, repo: string) =>
      `${person} has invited you to the "${repo}" project on Pages CMS.`,
    join: (repo: string) => `Join "${repo}"`,
    addedSubject: (repo: string) => `You were added to "${repo}"`,
    addedHeading: (repo: string) => `You were added to "${repo}"`,
    addedBody: (person: string, repo: string) =>
      `${person} added you to the "${repo}" project on Pages CMS. You already have access, so there is nothing to accept.`,
    open: (repo: string) => `Open "${repo}"`,
    copy: 'Or copy and paste this URL into your browser:',
  },
  fr: {
    recipient: 'Ce message est destiné à',
    ignore: 'Si vous ne l’avez pas demandé, vous pouvez ignorer ce message.',
    contact:
      'Si vous ne reconnaissez pas cette activité, contactez votre administrateur.',
    signSubject: (code: string) => `Votre code de connexion est ${code}`,
    signHeading: 'Se connecter à Pages CMS',
    signInstruction:
      'Saisissez ce code de vérification temporaire pour continuer :',
    expiry: 'Ce code expire dans 5 minutes.',
    inviteSubject: (repo: string) => `Invitation à rejoindre « ${repo} »`,
    inviteBody: (person: string, repo: string) =>
      `${person} vous invite à rejoindre le projet « ${repo} » sur Pages CMS.`,
    join: (repo: string) => `Rejoindre « ${repo} »`,
    addedSubject: (repo: string) => `Accès accordé à « ${repo} »`,
    addedHeading: (repo: string) => `Vous avez accès à « ${repo} »`,
    addedBody: (person: string, repo: string) =>
      `${person} vous a donné accès au projet « ${repo} » sur Pages CMS. Vous avez déjà accès, aucune acceptation n’est nécessaire.`,
    open: (repo: string) => `Ouvrir « ${repo} »`,
    copy: 'Vous pouvez aussi copier cette adresse dans votre navigateur :',
  },
  es: {
    recipient: 'Este correo está dirigido a',
    ignore: 'Si no lo solicitaste, puedes ignorar este correo.',
    contact: 'Si no reconoces esta actividad, contacta con tu administrador.',
    signSubject: (code: string) => `Tu código de acceso es ${code}`,
    signHeading: 'Inicia sesión en Pages CMS',
    signInstruction:
      'Introduce este código de verificación temporal para continuar:',
    expiry: 'Este código caduca en 5 minutos.',
    inviteSubject: (repo: string) => `Únete a «${repo}»`,
    inviteBody: (person: string, repo: string) =>
      `${person} te ha invitado al proyecto «${repo}» en Pages CMS.`,
    join: (repo: string) => `Unirse a «${repo}»`,
    addedSubject: (repo: string) => `Te han añadido a «${repo}»`,
    addedHeading: (repo: string) => `Te han añadido a «${repo}»`,
    addedBody: (person: string, repo: string) =>
      `${person} te ha añadido al proyecto «${repo}» en Pages CMS. Ya tienes acceso y no necesitas aceptar nada.`,
    open: (repo: string) => `Abrir «${repo}»`,
    copy: 'O copia y pega esta dirección en tu navegador:',
  },
  'pt-BR': {
    recipient: 'Este e-mail foi enviado para',
    ignore: 'Se você não solicitou isso, pode ignorar este e-mail.',
    contact:
      'Se você não reconhece esta atividade, entre em contato com seu administrador.',
    signSubject: (code: string) => `Seu código de acesso é ${code}`,
    signHeading: 'Entre no Pages CMS',
    signInstruction:
      'Digite este código de verificação temporário para continuar:',
    expiry: 'Este código expira em 5 minutos.',
    inviteSubject: (repo: string) => `Entre em "${repo}"`,
    inviteBody: (person: string, repo: string) =>
      `${person} convidou você para o projeto "${repo}" no Pages CMS.`,
    join: (repo: string) => `Entrar em "${repo}"`,
    addedSubject: (repo: string) => `Você foi adicionado a "${repo}"`,
    addedHeading: (repo: string) => `Você foi adicionado a "${repo}"`,
    addedBody: (person: string, repo: string) =>
      `${person} adicionou você ao projeto "${repo}" no Pages CMS. Você já tem acesso e não precisa aceitar nada.`,
    open: (repo: string) => `Abrir "${repo}"`,
    copy: 'Ou copie e cole este endereço no navegador:',
  },
  'zh-CN': {
    recipient: '此邮件发送至',
    ignore: '如果您没有发起此请求，可以忽略此邮件。',
    contact: '如果您不认识此操作，请联系管理员。',
    signSubject: (code: string) => `您的登录验证码是 ${code}`,
    signHeading: '登录 Pages CMS',
    signInstruction: '请输入以下临时验证码以继续：',
    expiry: '此验证码将在 5 分钟后过期。',
    inviteSubject: (repo: string) => `加入「${repo}」`,
    inviteBody: (person: string, repo: string) =>
      `${person} 邀请您加入 Pages CMS 上的「${repo}」项目。`,
    join: (repo: string) => `加入「${repo}」`,
    addedSubject: (repo: string) => `您已被添加到「${repo}」`,
    addedHeading: (repo: string) => `您已被添加到「${repo}」`,
    addedBody: (person: string, repo: string) =>
      `${person} 已将您添加到 Pages CMS 上的「${repo}」项目。您已拥有访问权限，无需接受邀请。`,
    open: (repo: string) => `打开「${repo}」`,
    copy: '或复制以下地址并粘贴到浏览器中：',
  },
} satisfies Record<Locale, unknown>
