// src/services/emailService.ts

/**
 * Service to handle email notifications.
 * In a real production environment, this would call a backend API 
 * that uses a service like SendGrid, Resend, or Amazon SES.
 */

const ADMIN_EMAIL = "admin01@example.com"; // Replace with actual admin email

export const sendMovementNotification = async (userName: string, action: string, details: string) => {
  console.log(`[EMAIL NOTIFICATION] To: ${ADMIN_EMAIL}`);
  console.log(`[EMAIL NOTIFICATION] Subject: Movimentação no RoboKit Manager`);
  console.log(`[EMAIL NOTIFICATION] Body: O usuário ${userName} realizou a seguinte ação: ${action}. Detalhes: ${details}`);

  // Example of how to implement with a real backend:
  /*
  try {
    await fetch('/api/notify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: ADMIN_EMAIL,
        subject: 'Movimentação no RoboKit Manager',
        message: `O usuário ${userName} realizou a seguinte ação: ${action}. Detalhes: ${details}`
      })
    });
  } catch (error) {
    console.error('Failed to send email notification:', error);
  }
  */
};
