# Bitwise Security - Professional Penetration Testing Website

A modern, cybersecurity-themed Next.js website for Bitwise Security featuring animated backgrounds, threat stream visualizations, and comprehensive service pages.

## 🚀 Features

- **Animated Cybersecurity Theme**: Particle effects, glowing elements, and dynamic threat stream
- **Responsive Design**: Fully responsive across all devices
- **Modern Stack**: Next.js 14, TypeScript, Tailwind CSS
- **Pages Included**:
  - Home: Dynamic threat stream and hero section
  - Services: Comprehensive pentesting services
  - About: Professional background and methodology
  - Contact: Interactive contact form

## 📦 Installation

1. **Install Dependencies**:
```bash
npm install
```

2. **Run Development Server**:
```bash
npm run dev
```

3. **Open Browser**:
Navigate to `http://localhost:3000`

## 🛠️ Build for Production

```bash
npm run build
npm start
```

## 📁 Project Structure

```
bitwise-security/
├── app/
│   ├── about/
│   │   └── page.tsx
│   ├── services/
│   │   └── page.tsx
│   ├── contact/
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── Navigation.tsx
│   └── CyberBackground.tsx
├── public/
├── package.json
└── tailwind.config.js
```

## 🎨 Customization

### Colors
Edit `tailwind.config.js` to modify the color scheme:
- `cyber-blue`: #00f3ff
- `cyber-orange`: #ff6b35
- `cyber-red`: #ff3366
- `cyber-dark`: #0a0e27
- `cyber-darkBlue`: #1a2332

### Content
- **Home Page**: Edit `app/page.tsx`
- **About Page**: Edit `app/about/page.tsx`
- **Services**: Edit `app/services/page.tsx`
- **Contact**: Edit `app/contact/page.tsx`

### Logo
The logo is currently rendered as SVG in the Navigation component. To use your actual logo:
1. Place your logo in the `public/` folder
2. Update `components/Navigation.tsx` to use the image

## 📧 Contact Form

The contact form posts to `/api/contact`, implemented by the Cloudflare Pages
Function in `functions/api/contact.ts`. It sends through the Resend HTTPS API.

Configure these encrypted Pages secrets before testing email delivery:

- `RESEND_API_KEY`: a Resend key restricted to sending email
- `RESEND_FROM_EMAIL`: a sender on a domain verified by Resend
- `CONTACT_EMAIL`: the address that receives contact submissions

Do not commit Resend or Cloudflare credentials. For local testing, use an
untracked `.dev.vars` file.

## 🌐 Deployment

### Cloudflare Pages

The site is exported to static files in `out`, while the contact endpoint runs
as a Pages Function. The staging project is deliberately isolated from the live
domain and existing production services.

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm run pages:deploy -- --project-name bitwise-security-test --branch agent/cloudflare-pages-test
```

### Other Platforms
The static `out` directory can be served by other static hosts, but the contact
form requires a compatible `/api/contact` serverless endpoint.

## 🔧 Technologies Used

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: CSS animations + Canvas API
- **Icons**: SVG

## 📝 License

Private - All rights reserved to Bitwise Security

## 🤝 Support

For issues or questions, contact: info@bitwise-security.nl
