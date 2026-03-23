import { NextResponse } from 'next/server';
import crypto from 'crypto';

function getSolapiAuth() {
  const apiKey = 'NCSHPOKWJ31REDXX';
  const apiSecret = 'IK9NOZCKXPVCEYNXYHSHOQMANSIHXHDD';
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const hmac = crypto.createHmac('sha256', apiSecret);
  hmac.update(date + salt);
  const signature = hmac.digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, name, phone, totalPrice } = body;

    const apiKey = 'NCSHPOKWJ31REDXX';
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'SOLAPI_API_KEY is not set' }, { status: 500 });
    }

    const domain = 'boramall.vercel.app';
    const domainPart = domain.replace(/^https?:\/\//, '');

    const sender = '01062699612'; // Default to the one found in template

    const payload = {
      messages: [
        {
          to: phone.replace(/[^0-9]/g, ''),
          from: sender.replace(/[^0-9]/g, ''),
          kakaoOptions: {
            pfId: 'KA01PF260322065238965YVuAFG1cg51',
            templateId: 'KA01TP260322181819347vhkcxBkG7G3',
            variables: {
              "#{이름}": name,
              "#{총금액}": parseInt(totalPrice, 10).toLocaleString() + "원",
              "#{청구서링크}": `${domainPart}/invoice/${orderId}`
            }
          }
        }
      ]
    };

    const response = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getSolapiAuth()
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (!response.ok) {
        throw new Error(`Solapi Error: ${JSON.stringify(result)}`);
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Alimtalk Send Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
