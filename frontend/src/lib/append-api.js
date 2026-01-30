const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, 'api.ts');
const content = fs.readFileSync(apiPath, 'utf8');

const newApi = `

// OTP Configuration (for form_filling automation)
export const otpConfigApi = {
  getOtp: () => api.get('/otp-config'),
  updateOtp: (otp: string) => api.put('/otp-config', { otp }),
};
`;

fs.writeFileSync(apiPath, content + newApi);
console.log('API updated successfully');
