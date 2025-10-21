import colors from 'colors';
import nodemailer from 'nodemailer';
import { config } from '../../config';
import { errorLogger, logger } from '../../shared/logger';
import { ISendEmail } from '../../types/email';

// Create Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: Number(config.smtp.port),
  secure: false,
  auth: {
    user: config.smtp.username,
    pass: config.smtp.password,
  },
});

// Verify transporter connection
if (config.environment !== 'test') {
  transporter
    .verify()
    .then(() => logger.info(colors.cyan('📧  Connected to email server')))
    .catch(() =>
      logger.warn(
        'Unable to connect to email server. Make sure you have configured the SMTP options in .env'
      )
    );
}

// Function to generate email HTML
const generateEmailHtml = (title: string, content: string) => {
  return `
  <div style="width: 100%; background: #f4f4f4; margin: 0 auto; font-family: Inter, sans-serif; text-align: center;  padding: 50px 0px;">
    <h1 style="font-size: 28px; color: black; font-weight: 600"> 🌨️ Harry By Graves</h1>
    <table style="width: 100%; background: #ffffff; max-width: 600px; margin: 0 auto; border: 1px solid rgb(216, 212, 212); box-shadow: 5px #ffffff; border-radius: 10px; padding: 20px;">
      <tr>
        <td>
          <h1 style="font-size: 22px; color: black; font-weight: 400">${title}</h1>
          ${content}
        </td>
      </tr>
    </table>
  </div>
  `;
};


// Function to send email
const sendEmail = async (values: ISendEmail) => {
  try {
    const info = await transporter.sendMail({
      from: `Harry By Graves <${config.smtp.emailFrom}>`,
      to: values.to,
      subject: values.subject,
      html: values.html,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        Importance: 'high',
      },
    });
    logger.info('Mail sent successfully', info.accepted);
  } catch (error) {
    errorLogger.error('Email', error);
  }
};

const sendVerificationEmail = async (to: string, otp: string) => {
  const subject = 'Harry By Graves - Verify Your Email Address';
  const content = `
    <h1 style="font-size: 30px; color: rgb(46, 44, 44); font-weight: 400; letter-spacing: 5px; margin: 30px 0px;">
      ${otp}
    </h1>
    <h1 style="font-size: 16px; color: rgb(46, 44, 44); font-weight: 400; margin: 20px 0px;">
      To verify your account, just enter this code in your app. The code expires in 30 minutes and you can only use it once.
    </h1>
    <h1 style="font-size: 14px; color: rgb(46, 44, 44); font-weight: 400; margin: 20px 0px;">
      This code is unique to you. Please don’t share it with anyone.
    </h1>
  `;
  const html = generateEmailHtml('Here’s your verification code', content);
  await sendEmail({ to, subject, html });
};

const sendResetPasswordEmail = async (to: string, otp: string) => {
  const subject = 'Harry By Graves - Reset Your Password';
  const content = `
    <h1 style="font-size: 30px; color: rgb(46, 44, 44); font-weight: 400; letter-spacing: 5px; margin: 30px 0px;">
      ${otp}
    </h1>
    <h1 style="font-size: 16px; color: rgb(46, 44, 44); font-weight: 400; margin: 20px 0px;">
      To reset your password, just enter this code in your app. The code expires in 30 minutes and you can only use it once.
    </h1>
    <h1 style="font-size: 14px; color: rgb(46, 44, 44); font-weight: 400; margin: 20px 0px;">
      This code is unique to you. Please don’t share it with anyone.
    </h1>
  `;
  const html = generateEmailHtml('Here’s your reset password code', content);
  await sendEmail({ to, subject, html });
};

// send login verification email
const sendLoginVerificationEmail = async (to: string, otp: string) => {
  const subject = 'Harry By Graves - Verify Your Login';
  const content = `
    <h1 style="font-size: 30px; color: rgb(46, 44, 44); font-weight: 400; letter-spacing: 5px; margin: 30px 0px;">
      ${otp}
    </h1>
    <h1 style="font-size: 16px; color: rgb(46, 44, 44); font-weight: 400; margin: 20px 0px;">
      To complete your login, please enter this code in the app. The code expires in 30 minutes and can only be used once.
    </h1>
    <h1 style="font-size: 14px; color: rgb(46, 44, 44); font-weight: 400; margin: 20px 0px;">
      This code is unique to you. Please don’t share it with anyone.
    </h1>
  `;
  const html = generateEmailHtml('Your login verification code', content);
  await sendEmail({ to, subject, html });
};

const sendWelcomeEmail = async (to: string, password: string) => {
  const subject = 'ArgHarry By Gravesento - Welcome to the Platform!';
  const content = `
    <p style="font-size: 16px;">
      Your password is: <strong>${password}</strong>
    </p>
  `;
  const html = generateEmailHtml('Welcome to Harry By Graves!', content);
  await sendEmail({ to, subject, html });
};

// Function to send Admin/SuperAdmin Creation Email
const sendAdminOrSuperAdminCreationEmail = async (
  email: string,
  role: string,
  password: string,
  message?: string // Optional custom message
) => {
  const subject = `Harry By Graves - Congratulations! You are now an ${role}`;
  const content = `
    <p>
      Congratulations! You've been granted the role of
      <strong>${role}</strong> in our system.
    </p>
    <p>To get started, please use the following credentials:</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Password:</strong> ${password}</p>
    <p><strong>Note:</strong> ${message}</p>
    <p style="margin-top: 30px;">
      Feel free to reach out if you have any questions or need
      assistance. We're excited to have you on board!
    </p>
    <p style="margin-top: 30px;">Best regards,<br />The Harry By Graves Team</p>
  `;
  const html = generateEmailHtml('Welcome to Harry By Graves!', content);

  await sendEmail({ to: email, subject, html });
};

const sendSupportMessageEmail = async (
  userEmail: string,
  userName: string,
  message: string
) => {
  const adminEmail = config.smtp.emailFrom; // Admin email from config
  const content = `
    <p style="font-size: 16px;"><strong>From:</strong> ${userName} (${userEmail})</p>
    <p style="font-size: 16px;">${message}</p>
  `;
  const html = generateEmailHtml('New Support Message', content);

  await sendEmail({
    to: adminEmail || '',
    subject: `Support Request from ${userName}`,
    html,
  });
};

const sendWarningEmail = async (
  to: string,
  userName: string,
  warningMessage: string
) => {
  const subject = 'Harry By Graves - Important Warning Notification';
  const content = `
    <p style="font-size: 16px;">Dear User ${userName},</p>
    <p style="font-size: 16px;">We have reviewed your recent activity on the Harry By Graves platform and found that it violates our community guidelines. Please review the details below:</p>
    <div style="background-color: #FFE6E6; padding: 15px; border-radius: 10px; margin: 20px 0;">
      <p style="font-size: 16px; color: #D32F2F; text-align: center;"><strong>⚠️ Warning:</strong> ${warningMessage}</p>
    </div>
    <p style="font-size: 14px; text-align: center; margin-top: 30px;">
      If you continue to violate our guidelines, further actions such as account suspension may be taken. Please ensure you follow our terms of service.
    </p>
  `;
  const html = generateEmailHtml('Warning Notification', content);

  await sendEmail({ to, subject, html });
};

const sendBanNotificationEmail = async (
  to: string,
  userName: string,
  banMessage: string,
  banUntil: Date | null
) => {
  const subject = 'Important: Your Account Has Been Banned';
  const formattedBanUntil = banUntil ? banUntil.toUTCString() : 'Permanently';
  const content = `
    <p style="font-size: 16px">Dear <strong>${userName}</strong>,</p>
    <p style="font-size: 16px">${banMessage}</p>
    <p style="font-size: 16px">
      <strong>Ban Expiry:</strong> ${formattedBanUntil}
    </p>
  `;

  const html = generateEmailHtml('Account Ban Notification', content);

  await sendEmail({ to, subject, html });
};
const sendReportConfirmation = async (to: string, userName: string) => {
  const subject = 'Thank You for Your Report!';
  const content = `
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 15px;">Hello ${userName},</p>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 15px;">We appreciate you taking the time to submit a report. Your feedback is valuable to us, and we'll review it as soon as possible. Rest assured, we'll take the necessary action and keep you updated.</p>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 15px;">If you have any more information to share or need assistance, feel free to reach out.</p>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 15px;">Thank you for helping us improve!</p>
    <a href="#" style="display: inline-block; background-color: #F1CF70; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; text-align: center; margin-top: 20px;">Contact Support</a>
    <p style="font-size: 14px; color: #777; text-align: center; margin-top: 20px;">Best regards,<br>The Harry By Graves Team</p>
  `;
  const html = generateEmailHtml('Thank You for Your Report!', content);
  await sendEmail({ to, subject, html });
};

export const emailService = {
  sendAdminOrSuperAdminCreationEmail,
  sendBanNotificationEmail,
  sendEmail,
  sendLoginVerificationEmail,
  sendReportConfirmation,
  sendResetPasswordEmail,
  sendSupportMessageEmail,
  sendVerificationEmail,
  sendWarningEmail,
  sendWelcomeEmail,
};