import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = {title:'Aachman Studios Control Center',description:'Private development and growth intelligence',robots:{index:false,follow:false},manifest:'/manifest.webmanifest'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
