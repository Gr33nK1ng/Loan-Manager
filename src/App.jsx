import { useState, useEffect } from 'react'
import './App.css'
import { db, auth, googleProvider } from './firebase'
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  getDoc,
  setDoc
} from 'firebase/firestore'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from 'firebase/auth'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// ─── Plan Configuration ───────────────────────────────────────────────────────

const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    borrowerLimit: 5,
    loanLimit: 10,
    receipts: false,
    reminders: false,
    reports: false,
    color: '#888'
  },
  basic: {
    name: 'Basic',
    monthlyPrice: 500,
    yearlyPrice: 5000,
    borrowerLimit: 50,
    loanLimit: null,
    receipts: true,
    reminders: false,
    reports: true,
    color: '#3498db',
    trialDays: 14
  },
  pro: {
    name: 'Pro',
    monthlyPrice: 1500,
    yearlyPrice: 15000,
    borrowerLimit: null,
    loanLimit: null,
    receipts: true,
    reminders: true,
    reports: true,
    color: '#1D9E75',
    trialDays: 14
  },
  business: {
    name: 'Business',
    monthlyPrice: 5000,
    yearlyPrice: 50000,
    borrowerLimit: null,
    loanLimit: null,
    receipts: true,
    reminders: true,
    reports: true,
    color: '#1a1a2e',
    trialDays: 14
  }
}

const MPESA_NUMBER = '0791486201' // Replace with your actual M-Pesa number
const WHATSAPP_NUMBER = '254791486201' // Replace with your actual WhatsApp number

// ─── Payment Receipt Component ────────────────────────────────────────────────

function PaymentReceipt({ txn, loan, onClose }) {
  const initials = txn.borrowerName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const formattedDate = new Date(txn.datePaid).toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric'
  })

  const generatePDF = async () => {
    const element = document.getElementById('receipt-card')
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    return pdf
  }

  const handleDownloadPDF = async () => {
    const pdf = await generatePDF()
    pdf.save(`Receipt-${txn.txnCode}.pdf`)
  }

  const handleEmail = async () => {
    const pdf = await generatePDF()
    pdf.save(`Receipt-${txn.txnCode}.pdf`)
    const subject = encodeURIComponent(`Payment Receipt – ${txn.txnCode}`)
    const body = encodeURIComponent(
      `Dear ${txn.borrowerName},\n\nPlease find your payment receipt attached.\n\n` +
      `TXN Code: ${txn.txnCode}\n` +
      `Amount Paid: ${txn.currency} ${txn.amountPaid.toLocaleString()}\n` +
      `Date: ${formattedDate}\n` +
      `Remaining Balance: ${txn.currency} ${txn.remainingBalance.toLocaleString()}\n\n` +
      `Thank you for your payment.\n\n💰 Loan Manager`
    )
    setTimeout(() => { window.location.href = `mailto:?subject=${subject}&body=${body}` }, 500)
  }
  
  const handleWhatsApp = async () => {
    const pdf = await generatePDF()
    pdf.save(`Receipt-${txn.txnCode}.pdf`)
    setTimeout(() => {
      const text = encodeURIComponent(
        `💰 *LOAN MANAGER – PAYMENT RECEIPT*\n\n` +
        `TXN Code: *${txn.txnCode}*\n` +
        `Date: ${formattedDate}\n` +
        `Borrower: ${txn.borrowerName}\n` +
        `Installments: ${txn.installmentsCovered?.join(', ')}\n` +
        `Amount Paid: *${txn.currency} ${txn.amountPaid.toLocaleString()}*\n` +
        `Remaining Balance: ${txn.currency} ${txn.remainingBalance.toLocaleString()}\n` +
        `Method: ${txn.method} | Ref: ${txn.referenceCode}\n\n` +
        `_PDF receipt has been downloaded. Please attach it to this message._\n\n` +
        `_Thank you for your payment_ 🙏`
      )
      window.open(`https://wa.me/?text=${text}`, '_blank')
    }, 800)
  }

  const handleCopy = () => {
    const text = [
      '💰 LOAN MANAGER – PAYMENT RECEIPT',
      '─────────────────────────────────',
      `TXN Code:   ${txn.txnCode}`,
      `Date:       ${formattedDate}`,
      `Borrower:   ${txn.borrowerName}`,
      `Installments: ${txn.installmentsCovered?.join(', ')}`,
      `Amount Paid: ${txn.currency} ${txn.amountPaid.toLocaleString()}`,
      `Remaining:  ${txn.currency} ${txn.remainingBalance.toLocaleString()}`,
      `Method:     ${txn.method}`,
      `Reference:  ${txn.referenceCode}`,
      '─────────────────────────────────',
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => alert('Receipt copied to clipboard!'))
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '420px', padding: 0, overflow: 'hidden' }}>
        <div id="receipt-card" style={{ background: '#fff' }}>
          <div style={{ background: '#1a1a2e', padding: '20px 24px 16px', textAlign: 'center' }}>
            <p style={{ color: '#a0a8c0', fontSize: '11px', letterSpacing: '0.12em', margin: '0 0 4px', textTransform: 'uppercase' }}>Loan Manager</p>
            <p style={{ color: '#fff', fontSize: '18px', fontWeight: 600, margin: '0 0 2px' }}>Payment Receipt</p>
            <p style={{ color: '#6b7a99', fontSize: '12px', margin: 0 }}>{formattedDate}</p>
          </div>
          <div style={{ background: '#1D9E75', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#e1f5ee', fontSize: '12px', letterSpacing: '0.08em' }}>TXN CODE</span>
            <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600, fontFamily: 'monospace' }}>{txn.txnCode}</span>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #eee' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600, color: '#0F6E56', flexShrink: 0 }}>{initials}</div>
              <div>
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1a1a2e' }}>{txn.borrowerName}</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>{loan?.phone || ''}</p>
              </div>
              <span style={{ marginLeft: 'auto', background: '#E1F5EE', color: '#0F6E56', fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px' }}>✓ Paid</span>
            </div>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={{ color: '#888', padding: '6px 0' }}>Loan Principal</td><td style={{ textAlign: 'right', color: '#1a1a2e', padding: '6px 0' }}>{txn.currency} {loan?.principal?.toLocaleString() || '—'}</td></tr>
                <tr><td style={{ color: '#888', padding: '6px 0' }}>Installments Covered</td><td style={{ textAlign: 'right', color: '#1a1a2e', padding: '6px 0' }}>{txn.installmentsCovered?.join(', ')}</td></tr>
                <tr><td style={{ color: '#888', padding: '6px 0' }}>Payment Method</td><td style={{ textAlign: 'right', color: '#1a1a2e', padding: '6px 0' }}>{txn.method}</td></tr>
                <tr><td style={{ color: '#888', padding: '6px 0' }}>{txn.method} Reference</td><td style={{ textAlign: 'right', color: '#1a1a2e', padding: '6px 0', fontFamily: 'monospace', fontSize: '12px' }}>{txn.referenceCode}</td></tr>
                {txn.notes && <tr><td style={{ color: '#888', padding: '6px 0' }}>Notes</td><td style={{ textAlign: 'right', color: '#1a1a2e', padding: '6px 0' }}>{txn.notes}</td></tr>}
              </tbody>
            </table>
            <div style={{ marginTop: '16px', padding: '14px 16px', background: '#f7f9fc', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#888' }}>Amount Paid</span>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#1D9E75' }}>{txn.currency} {txn.amountPaid.toLocaleString()}</span>
            </div>
            <div style={{ marginTop: '10px', padding: '10px 16px', border: '1px solid #eee', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#888' }}>Remaining Balance</span>
              <span style={{ fontSize: '15px', fontWeight: 600, color: txn.remainingBalance <= 0 ? '#1D9E75' : '#e74c3c' }}>{txn.remainingBalance <= 0 ? '✅ Cleared' : `${txn.currency} ${txn.remainingBalance.toLocaleString()}`}</span>
            </div>
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed #ddd', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#aaa', margin: '0 0 4px' }}>Thank you for your payment</p>
              <p style={{ fontSize: '10px', color: '#bbb', margin: 0 }}>💰 Loan Manager · Keep this receipt for your records</p>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid #eee', display: 'flex', gap: '8px', flexWrap: 'wrap', background: '#fff' }}>
          <button className="btn-secondary" style={{ flex: 1, fontSize: '13px' }} onClick={handleDownloadPDF}>📄 Download PDF</button>
          <button className="btn-secondary" style={{ flex: 1, fontSize: '13px' }} onClick={handleCopy}>📋 Copy</button>
          <button className="btn-secondary" style={{ flex: 1, fontSize: '13px' }} onClick={handleEmail}>📧 Email</button>
          <button className="btn-secondary" style={{ flex: 1, fontSize: '13px' }} onClick={handleWhatsApp}>📲 WhatsApp</button>
          <button className="btn-primary" style={{ width: '100%', fontSize: '13px', marginTop: '4px' }} onClick={onClose}>✓ Done</button>
        </div>
      </div>
    </div>
  )
}

// ─── Pricing Modal ────────────────────────────────────────────────────────────

function PricingModal({ onClose, currentPlan, onSubmitPayment }) {
  const [billing, setBilling] = useState('monthly')
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [step, setStep] = useState('plans')
  const [mpesaCode, setMpesaCode] = useState('')
  const [phone, setPhone] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const getPrice = (plan) => {
    if (plan === 'free') return 'Free'
    const p = PLANS[plan]
    return billing === 'monthly'
      ? `KSh ${p.monthlyPrice.toLocaleString()}/mo`
      : `KSh ${p.yearlyPrice.toLocaleString()}/yr`
  }

  const getAmount = (plan) => {
    const p = PLANS[plan]
    return billing === 'monthly' ? p.monthlyPrice : p.yearlyPrice
  }

  const handleSelectPlan = (plan) => {
    if (plan === 'free') return
    setSelectedPlan(plan)
    setStep('payment')
  }

  const handleSubmit = () => {
    if (!mpesaCode || !phone) {
      alert('Please fill in all fields')
      return
    }
    onSubmitPayment({
      plan: selectedPlan,
      billing,
      amount: getAmount(selectedPlan),
      mpesaCode,
      phone
    })
    setSubmitted(true)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>

        {step === 'plans' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>Choose your plan</h3>
              <button className="btn-secondary" onClick={onClose}>✕</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <div style={{ background: '#f0f2f5', borderRadius: '10px', padding: '4px', display: 'flex', gap: '4px' }}>
                <button
                  style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: billing === 'monthly' ? '#fff' : 'transparent', fontWeight: billing === 'monthly' ? 600 : 400, fontSize: '14px' }}
                  onClick={() => setBilling('monthly')}
                >
                  Monthly
                </button>
                <button
                  style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: billing === 'yearly' ? '#fff' : 'transparent', fontWeight: billing === 'yearly' ? 600 : 400, fontSize: '14px' }}
                  onClick={() => setBilling('yearly')}
                >
                  Yearly <span style={{ color: '#1D9E75', fontSize: '12px' }}>2 months free</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {['free', 'basic', 'pro', 'business'].map(plan => (
                <div
                  key={plan}
                  style={{
                    border: `2px solid ${currentPlan === plan ? PLANS[plan].color || '#888' : '#eee'}`,
                    borderRadius: '12px',
                    padding: '20px',
                    cursor: plan === 'free' ? 'default' : 'pointer',
                    background: currentPlan === plan ? '#f9f9f9' : '#fff'
                  }}
                  onClick={() => handleSelectPlan(plan)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ color: PLANS[plan].color || '#888', margin: 0 }}>{PLANS[plan].name}</h4>
                    {currentPlan === plan && <span style={{ fontSize: '11px', background: '#f0f2f5', padding: '2px 8px', borderRadius: '20px' }}>Current</span>}
                    {plan !== 'free' && <span style={{ fontSize: '11px', background: '#E1F5EE', color: '#0F6E56', padding: '2px 8px', borderRadius: '20px' }}>14 day trial</span>}
                  </div>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a2e', margin: '0 0 12px' }}>{getPrice(plan)}</p>
                  <div style={{ fontSize: '13px', color: '#555' }}>
                    <p style={{ margin: '4px 0' }}>👥 {PLANS[plan].borrowerLimit ? `${PLANS[plan].borrowerLimit} borrowers` : 'Unlimited borrowers'}</p>
                    <p style={{ margin: '4px 0' }}>📋 {PLANS[plan].loanLimit ? `${PLANS[plan].loanLimit} loans` : 'Unlimited loans'}</p>
                    <p style={{ margin: '4px 0' }}>{PLANS[plan].receipts ? '✅' : '❌'} PDF receipts</p>
                    <p style={{ margin: '4px 0' }}>{PLANS[plan].reminders ? '✅' : '❌'} Payment reminders</p>
                    <p style={{ margin: '4px 0' }}>{PLANS[plan].reports ? '✅' : '❌'} Reports export</p>
                  </div>
                  {plan !== 'free' && (
                    <button
                      className="btn-primary"
                      style={{ width: '100%', marginTop: '16px', fontSize: '14px' }}
                      onClick={() => handleSelectPlan(plan)}
                    >
                      {currentPlan === plan ? 'Current Plan' : 'Start 14 day trial'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'payment' && !submitted && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>Complete your upgrade</h3>
              <button className="btn-secondary" onClick={() => setStep('plans')}>← Back</button>
            </div>

            <div style={{ background: '#f0f2f5', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h4 style={{ margin: '0 0 8px', color: '#1a1a2e' }}>
                {PLANS[selectedPlan]?.name} Plan — {billing === 'monthly' ? 'Monthly' : 'Yearly'}
              </h4>
              <p style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 700, color: '#1a1a2e' }}>
                KSh {getAmount(selectedPlan)?.toLocaleString()}
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>
                14 day free trial — you will not be charged until your trial ends
              </p>
            </div>

            <div style={{ background: '#E1F5EE', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h4 style={{ margin: '0 0 12px', color: '#0F6E56' }}>📱 Pay via M-Pesa</h4>
              <div style={{ fontSize: '14px', color: '#1a1a2e', lineHeight: '2' }}>
                <p style={{ margin: '0 0 4px' }}>1. Go to M-Pesa on your phone</p>
                <p style={{ margin: '0 0 4px' }}>2. Select <strong>Send Money</strong></p>
                <p style={{ margin: '0 0 4px' }}>3. Enter number: <strong style={{ fontSize: '18px', color: '#0F6E56' }}>{MPESA_NUMBER}</strong></p>
                <p style={{ margin: '0 0 4px' }}>4. Enter amount: <strong>KSh {getAmount(selectedPlan)?.toLocaleString()}</strong></p>
                <p style={{ margin: '0 0 4px' }}>5. Enter your M-Pesa PIN and confirm</p>
                <p style={{ margin: 0 }}>6. Copy the M-Pesa confirmation code and paste below</p>
              </div>
            </div>

            <div className="form-group">
              <label>Your Phone Number *</label>
              <input
                type="tel"
                placeholder="e.g. 0712345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>M-Pesa Confirmation Code *</label>
              <input
                type="text"
                placeholder="e.g. ABC123XYZ"
                value={mpesaCode}
                onChange={(e) => setMpesaCode(e.target.value.toUpperCase())}
                style={{ fontFamily: 'monospace', fontSize: '16px', letterSpacing: '0.1em' }}
              />
              <small style={{ color: '#888', fontSize: '12px' }}>
                This is the code in the M-Pesa SMS confirmation message
              </small>
            </div>

            <button className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '15px' }} onClick={handleSubmit}>
              Submit Payment for Verification
            </button>

            <p style={{ textAlign: 'center', fontSize: '12px', color: '#aaa', marginTop: '12px' }}>
              Your plan will be activated within 24 hours after verification
            </p>
          </div>
        )}

        {submitted && (
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <h3 style={{ color: '#1D9E75', marginBottom: '8px' }}>Payment Submitted!</h3>
            <p style={{ color: '#555', marginBottom: '16px' }}>
              Your payment is being verified. Your plan will be activated within 24 hours.
            </p>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '24px' }}>
              For faster activation send your M-Pesa code <strong>{mpesaCode}</strong> to WhatsApp:
            </p>
            <button
              className="btn-primary"
              style={{ marginBottom: '12px', width: '100%' }}
              onClick={() => {
                const text = encodeURIComponent(
                  `💰 *Loan Manager Subscription*\n\n` +
                  `Plan: ${PLANS[selectedPlan]?.name} (${billing})\n` +
                  `Amount: KSh ${getAmount(selectedPlan)?.toLocaleString()}\n` +
                  `M-Pesa Code: *${mpesaCode}*\n` +
                  `Phone: ${phone}\n\n` +
                  `Please activate my account. Thank you!`
                )
                window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank')
              }}
            >
              📲 Send via WhatsApp for faster activation
            </button>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Limit Banner Component ───────────────────────────────────────────────────

function LimitBanner({ message, onUpgrade }) {
  return (
    <div style={{
      background: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: '10px',
      padding: '16px 20px',
      marginBottom: '16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div>
        <p style={{ margin: 0, fontWeight: 600, color: '#856404', fontSize: '14px' }}>⚠️ {message}</p>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#856404' }}>Upgrade your plan to continue</p>
      </div>
      <button className="btn-primary" style={{ fontSize: '13px', whiteSpace: 'nowrap' }} onClick={onUpgrade}>
        Upgrade Now
      </button>
    </div>
  )
}

// ─── Trial Banner Component ───────────────────────────────────────────────────

function TrialBanner({ daysLeft, onUpgrade }) {
  return (
    <div style={{
      background: '#E1F5EE',
      borderBottom: '1px solid #9FE1CB',
      padding: '10px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <p style={{ margin: 0, fontSize: '13px', color: '#0F6E56' }}>
        🎁 <strong>{daysLeft} days</strong> left in your free trial
      </p>
      <button
        style={{ fontSize: '12px', background: '#1D9E75', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer' }}
        onClick={onUpgrade}
      >
        Upgrade Now
      </button>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [user, setUser] = useState(null)
  const [authPage, setAuthPage] = useState('login')
  const [authLoading, setAuthLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const [showModal, setShowModal] = useState(false)
  const [showLoanModal, setShowLoanModal] = useState(false)
  const [showLoanDetail, setShowLoanDetail] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showPricing, setShowPricing] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const sanitize = (str) => {
  if (typeof str !== 'string') return str
  return str.replace(/[<>{}]/g, '').trim()
}

useEffect(() => {
  let timeout
  const resetTimer = () => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      if (user) {
        logout()
        alert('You have been logged out due to inactivity.')
      }
    }, 30 * 60 * 1000)
  }
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
  events.forEach(e => window.addEventListener(e, resetTimer))
  resetTimer()
  return () => {
    clearTimeout(timeout)
    events.forEach(e => window.removeEventListener(e, resetTimer))
  }
}, [user])
  const [lastTxn, setLastTxn] = useState(null)
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [borrowers, setBorrowers] = useState([])
  const [loans, setLoans] = useState([])
  const [transactions, setTransactions] = useState([])
  const [selectedBorrower, setSelectedBorrower] = useState(null)
  const [authError, setAuthError] = useState('')
  const [phoneStep, setPhoneStep] = useState('phone')
  const [confirmationResult, setConfirmationResult] = useState(null)
  const [userPlan, setUserPlan] = useState({
    plan: 'free',
    billing: 'monthly',
    trialStart: null,
    trialEnd: null,
    status: 'active'
  })

  const [loginData, setLoginData] = useState({ email: '', password: '' })
  const [signupData, setSignupData] = useState({ email: '', password: '', confirmPassword: '' })
  const [phoneData, setPhoneData] = useState({ phone: '', otp: '' })
  const [newBorrower, setNewBorrower] = useState({ name: '', phone: '', idNumber: '', email: '', notes: '' })
  const [newLoan, setNewLoan] = useState({
    borrowerName: '', currency: 'KSh', principal: '', interestRate: '',
    duration: '', frequency: 'Monthly', startDate: '', notes: '', status: 'active'
  })
  const [paymentData, setPaymentData] = useState({
    amountPaid: '', method: 'M-Pesa', referenceCode: '',
    datePaid: new Date().toISOString().split('T')[0], notes: ''
  })

  const trialDaysLeft = () => {
    if (!userPlan.trialEnd) return 0
    const diff = new Date(userPlan.trialEnd) - new Date()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  const isOnTrial = () => userPlan.plan !== 'free' && userPlan.status === 'trial' && trialDaysLeft() > 0

  const canAddBorrower = () => {
    const limit = PLANS[userPlan.plan]?.borrowerLimit
    if (!limit) return true
    return borrowers.length < limit
  }

  const canAddLoan = () => {
    const limit = PLANS[userPlan.plan]?.loanLimit
    if (!limit) return true
    return loans.length < limit
  }

  const currentPlanName = () => PLANS[userPlan.plan]?.name || 'Free'

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      setAuthLoading(false)
      if (currentUser) {
        const planDoc = await getDoc(doc(db, 'plans', currentUser.uid))
        if (planDoc.exists()) {
          setUserPlan(planDoc.data())
        } else {
          const trialEnd = new Date()
          trialEnd.setDate(trialEnd.getDate() + 14)
          const defaultPlan = {
            plan: 'pro',
            billing: 'monthly',
            status: 'trial',
            trialStart: new Date().toISOString(),
            trialEnd: trialEnd.toISOString()
          }
          await setDoc(doc(db, 'plans', currentUser.uid), defaultPlan)
          setUserPlan(defaultPlan)
        }
      }
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'borrowers'), where('userId', '==', user.uid))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBorrowers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    })
    return () => unsubscribe()
  }, [user])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'loans'), where('userId', '==', user.uid))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLoans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    })
    return () => unsubscribe()
  }, [user])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'transactions'), where('userId', '==', user.uid))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    })
    return () => unsubscribe()
  }, [user])

  const handleSubmitPayment = async (paymentInfo) => {
    try {
      await addDoc(collection(db, 'subscriptionRequests'), {
        userId: user.uid,
        email: user.email || user.phoneNumber,
        ...paymentInfo,
        status: 'pending',
        createdAt: new Date().toISOString()
      })
    } catch (error) {
      console.error('Error submitting payment:', error)
    }
  }

  const generateTxnCode = () => {
    const series = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    const totalTxns = transactions.length + 1
    const seriesIndex = Math.floor((totalTxns - 1) / 1000)
    const seriesLetter = series[seriesIndex] || 'Z'
    const txnNumber = ((totalTxns - 1) % 1000) + 1
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let random = ''
    for (let i = 0; i < 6; i++) random += chars.charAt(Math.floor(Math.random() * chars.length))
    return `${seriesLetter}${txnNumber}${random}`
  }

  const generateInstallments = (loan) => {
    const installments = []
    const start = new Date(loan.startDate)
    for (let i = 0; i < Number(loan.duration); i++) {
      let dueDate = new Date(start)
      if (loan.frequency === 'Monthly') dueDate.setMonth(dueDate.getMonth() + (i + 1))
      else if (loan.frequency === 'Weekly') dueDate.setDate(dueDate.getDate() + (7 * (i + 1)))
      else if (loan.frequency === 'Daily') dueDate.setDate(dueDate.getDate() + (i + 1))
      installments.push({
        number: i + 1, dueDate: dueDate.toDateString(),
        amountDue: loan.installmentAmount, amountPaid: 0, status: 'pending', txnCode: null
      })
    }
    return installments
  }

  const recordPayment = async () => {
    if (!paymentData.amountPaid || !paymentData.referenceCode) {
      alert('Please fill in all required fields'); return
    }
    const amountPaid = Number(paymentData.amountPaid)
    if (amountPaid <= 0) { alert('Amount paid must be greater than 0'); return }
    if (amountPaid > selectedLoan.remainingBalance) {
      alert(`Amount paid cannot exceed remaining balance of ${selectedLoan.currency} ${selectedLoan.remainingBalance.toLocaleString()}`); return
    }
    const txnCode = generateTxnCode()
    let remainingPayment = amountPaid
    let newRemainingBalance = selectedLoan.remainingBalance
    const updatedInstallments = [...(selectedLoan.installments || generateInstallments(selectedLoan))]
    const paidInstallments = []
    for (let i = 0; i < updatedInstallments.length; i++) {
      if (remainingPayment <= 0) break
      const installment = updatedInstallments[i]
      if (installment.status === 'paid') continue
      const amountStillDue = installment.amountDue - (installment.amountPaid || 0)
      if (remainingPayment >= amountStillDue) {
        updatedInstallments[i] = { ...installment, amountPaid: installment.amountDue, status: 'paid', txnCode, datePaid: paymentData.datePaid }
        remainingPayment -= amountStillDue
        newRemainingBalance -= amountStillDue
        paidInstallments.push(`Installment ${installment.number}`)
      } else {
        updatedInstallments[i] = { ...installment, amountPaid: (installment.amountPaid || 0) + remainingPayment, status: 'partial', txnCode, datePaid: paymentData.datePaid }
        newRemainingBalance -= remainingPayment
        paidInstallments.push(`Installment ${installment.number} (partial)`)
        remainingPayment = 0
      }
    }
    const newStatus = newRemainingBalance <= 0 ? 'cleared' : 'active'
    const nextUnpaid = updatedInstallments.find(i => i.status !== 'paid')
    const nextDueDate = nextUnpaid ? nextUnpaid.dueDate : 'Cleared'
    try {
      await updateDoc(doc(db, 'loans', selectedLoan.id), {
        remainingBalance: newRemainingBalance, installments: updatedInstallments, status: newStatus, nextDueDate
      })
      const txnRecord = {
        userId: user.uid, loanId: selectedLoan.id, borrowerName: selectedLoan.borrowerName,
        txnCode, amountPaid, method: paymentData.method, referenceCode: paymentData.referenceCode,
        datePaid: paymentData.datePaid, notes: paymentData.notes, remainingBalance: newRemainingBalance,
        installmentsCovered: paidInstallments, currency: selectedLoan.currency, createdAt: new Date().toISOString()
      }
      await addDoc(collection(db, 'transactions'), txnRecord)
      const borrower = borrowers.find(b => b.name === selectedLoan.borrowerName)
      setLastTxn({ ...txnRecord, loan: { ...selectedLoan, phone: borrower?.phone || '' } })
      setShowPaymentModal(false)
      setShowReceipt(true)
      setPaymentData({ amountPaid: '', method: 'M-Pesa', referenceCode: '', datePaid: new Date().toISOString().split('T')[0], notes: '' })
      const updatedLoan = loans.find(l => l.id === selectedLoan.id)
      if (updatedLoan) setSelectedLoan({ ...updatedLoan, remainingBalance: newRemainingBalance, installments: updatedInstallments, status: newStatus })
    } catch (error) {
      alert('Error recording payment. Please try again.')
      console.error(error)
    }
  }

  const loginWithEmail = async () => {
    setAuthError('')
    if (!loginData.email || !loginData.password) { setAuthError('Please fill in all fields'); return }
    try {
      await signInWithEmailAndPassword(auth, loginData.email, loginData.password)
    } catch (error) { setAuthError('Invalid email or password. Please try again.') }
  }

  const signupWithEmail = async () => {
    setAuthError('')
    if (!signupData.email || !signupData.password || !signupData.confirmPassword) { setAuthError('Please fill in all fields'); return }
    if (signupData.password !== signupData.confirmPassword) { setAuthError('Passwords do not match'); return }
    if (signupData.password.length < 8) { setAuthError('Password must be at least 8 characters'); return }
    if (signupData.password.length > 10) { setAuthError('Password must not exceed 10 characters'); return }
    try {
      await createUserWithEmailAndPassword(auth, signupData.email, signupData.password)
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') { setAuthError('Email already in use. Please login instead.') }
      else { setAuthError('Error creating account. Please try again.') }
    }
  }

  const loginWithGoogle = async () => {
    setAuthError('')
    try { await signInWithPopup(auth, googleProvider) }
    catch (error) { setAuthError('Error signing in with Google. Please try again.') }
  }

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible', callback: () => {} })
    }
  }

  const sendOTP = async () => {
    setAuthError('')
    if (!phoneData.phone) { setAuthError('Please enter your phone number'); return }
    try {
      setupRecaptcha()
      const result = await signInWithPhoneNumber(auth, phoneData.phone, window.recaptchaVerifier)
      setConfirmationResult(result)
      setPhoneStep('otp')
    } catch (error) { setAuthError('Error sending OTP. Make sure phone number includes country code e.g. +254712345678') }
  }

  const verifyOTP = async () => {
    setAuthError('')
    if (!phoneData.otp) { setAuthError('Please enter the OTP code'); return }
    try { await confirmationResult.confirm(phoneData.otp) }
    catch (error) { setAuthError('Invalid OTP code. Please try again.') }
  }

  const logout = async () => {
    await signOut(auth)
    setPage('dashboard')
    setSelectedBorrower(null)
    setSelectedLoan(null)
  }

  const saveBorrower = async () => {
    if (!newBorrower.name || !newBorrower.phone || !newBorrower.idNumber || !newBorrower.email) {
      alert('Please fill in all required fields'); return
    }
    if (!canAddBorrower()) {
      setShowPricing(true); return
    }
    try {
      await addDoc(collection(db, 'borrowers'), {   name: sanitize(newBorrower.name),
  phone: sanitize(newBorrower.phone),
  idNumber: sanitize(newBorrower.idNumber),
  email: sanitize(newBorrower.email),
  notes: sanitize(newBorrower.notes),
  userId: user.uid})
      setNewBorrower({ name: '', phone: '', idNumber: '', email: '', notes: '' })
      setShowModal(false)
    } catch (error) { alert('Error saving borrower. Please try again.'); console.error(error) }
  }

  const deleteBorrower = async (id) => {
    try { await deleteDoc(doc(db, 'borrowers', id)) }
    catch (error) { alert('Error deleting borrower. Please try again.'); console.error(error) }
  }

  const saveLoan = async () => {
    if (!newLoan.borrowerName || !newLoan.principal || !newLoan.interestRate || !newLoan.duration || !newLoan.startDate) {
      alert('Please fill in all required fields'); return
    }
    if (!canAddLoan()) { setShowPricing(true); return }
    const alreadyHasLoan = loans.find(l => l.borrowerName === newLoan.borrowerName && l.status === 'active')
    if (alreadyHasLoan) { alert(`${newLoan.borrowerName} already has an active loan. They must clear it first.`); return }
    const principal = Number(newLoan.principal)
    const interestAmount = principal * Number(newLoan.interestRate) / 100
    const totalExpected = principal + interestAmount
    const installmentAmount = Math.ceil(totalExpected / Number(newLoan.duration))
    const start = new Date(newLoan.startDate)
    let nextDueDate = new Date(start)
    if (newLoan.frequency === 'Monthly') nextDueDate.setMonth(nextDueDate.getMonth() + 1)
    else if (newLoan.frequency === 'Weekly') nextDueDate.setDate(nextDueDate.getDate() + 7)
    else if (newLoan.frequency === 'Daily') nextDueDate.setDate(nextDueDate.getDate() + 1)
    const installments = []
    for (let i = 0; i < Number(newLoan.duration); i++) {
      let dueDate = new Date(start)
      if (newLoan.frequency === 'Monthly') dueDate.setMonth(dueDate.getMonth() + (i + 1))
      else if (newLoan.frequency === 'Weekly') dueDate.setDate(dueDate.getDate() + (7 * (i + 1)))
      else if (newLoan.frequency === 'Daily') dueDate.setDate(dueDate.getDate() + (i + 1))
      installments.push({ number: i + 1, dueDate: dueDate.toDateString(), amountDue: installmentAmount, amountPaid: 0, status: 'pending', txnCode: null })
    }
    const loan = { ...newLoan, principal, interestAmount, totalExpected, installmentAmount, remainingBalance: totalExpected, nextDueDate: nextDueDate.toDateString(), installments, userId: user.uid }
    try {
      await addDoc(collection(db, 'loans'), loan)
      setNewLoan({ borrowerName: '', currency: 'KSh', principal: '', interestRate: '', duration: '', frequency: 'Monthly', startDate: '', notes: '', status: 'active' })
      setShowLoanModal(false)
    } catch (error) { alert('Error saving loan. Please try again.'); console.error(error) }
  }

  const getBorrowerLoans = (borrowerName) => loans.filter(l => l.borrowerName === borrowerName)

  const getBorrowerStats = (borrowerName) => {
    const borrowerLoans = getBorrowerLoans(borrowerName)
    return {
      totalBorrowed: borrowerLoans.reduce((sum, l) => sum + l.principal, 0),
      totalExpected: borrowerLoans.reduce((sum, l) => sum + l.totalExpected, 0),
      totalPaid: borrowerLoans.reduce((sum, l) => sum + (l.totalExpected - l.remainingBalance), 0),
      totalOwing: borrowerLoans.reduce((sum, l) => sum + l.remainingBalance, 0),
      activeLoans: borrowerLoans.filter(l => l.status === 'active').length,
      clearedLoans: borrowerLoans.filter(l => l.status === 'cleared').length,
      totalLoans: borrowerLoans.length
    }
  }

  const getLoanTransactions = (loanId) => transactions.filter(t => t.loanId === loanId)

  if (authLoading) {
    return (
      <div className="auth-loading">
        <h2>💰 Loan Manager</h2>
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-logo">💰 Loan Manager</h1>
          <p className="auth-tagline">Manage your soft loans professionally</p>
          <div className="auth-tabs">
            <button className={authPage === 'login' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setAuthPage('login'); setAuthError('') }}>Login</button>
            <button className={authPage === 'signup' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setAuthPage('signup'); setAuthError('') }}>Sign Up</button>
            <button className={authPage === 'phone' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setAuthPage('phone'); setAuthError('') }}>Phone</button>
          </div>
          {authError && <div className="auth-error">{authError}</div>}
          {authPage === 'login' && (
            <div>
              <div className="form-group"><label>Email Address</label><input type="email" placeholder="your@email.com" value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} /></div>
              <div className="form-group"><label>Password</label><input type="password" placeholder="Your password" value={loginData.password} onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} /></div>
              <button className="btn-primary auth-btn" onClick={loginWithEmail}>Login</button>
              <div className="auth-divider">or</div>
              <button className="btn-google" onClick={loginWithGoogle}>🔵 Continue with Google</button>
            </div>
          )}
          {authPage === 'signup' && (
            <div>
              <div className="form-group"><label>Email Address</label><input type="email" placeholder="your@email.com" value={signupData.email} onChange={(e) => setSignupData({ ...signupData, email: e.target.value })} /></div>
              <div className="form-group"><label>Password (8-10 characters)</label><input type="password" placeholder="8 to 10 characters" value={signupData.password} onChange={(e) => setSignupData({ ...signupData, password: e.target.value })} /></div>
              <div className="form-group"><label>Confirm Password</label><input type="password" placeholder="Repeat your password" value={signupData.confirmPassword} onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })} /></div>
              <button className="btn-primary auth-btn" onClick={signupWithEmail}>Create Account</button>
              <div className="auth-divider">or</div>
              <button className="btn-google" onClick={loginWithGoogle}>🔵 Continue with Google</button>
            </div>
          )}
          {authPage === 'phone' && (
            <div>
              {phoneStep === 'phone' && (
                <div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input type="tel" placeholder="+254712345678" value={phoneData.phone} onChange={(e) => setPhoneData({ ...phoneData, phone: e.target.value })} />
                    <small style={{ color: '#888', fontSize: '12px' }}>Include country code e.g. +254 for Kenya</small>
                  </div>
                  <button className="btn-primary auth-btn" onClick={sendOTP}>Send OTP Code</button>
                  <div id="recaptcha-container"></div>
                </div>
              )}
              {phoneStep === 'otp' && (
                <div>
                  <p style={{ color: '#555', marginBottom: '16px', fontSize: '14px' }}>Enter the 6 digit code sent to {phoneData.phone}</p>
                  <div className="form-group"><label>OTP Code</label><input type="text" placeholder="123456" value={phoneData.otp} onChange={(e) => setPhoneData({ ...phoneData, otp: e.target.value })} /></div>
                  <button className="btn-primary auth-btn" onClick={verifyOTP}>Verify OTP</button>
                  <button className="btn-secondary auth-btn" style={{ marginTop: '8px' }} onClick={() => setPhoneStep('phone')}>← Change number</button>
                </div>
              )}
            </div>
          )}
          <p className="auth-footer">🔒 Your data is encrypted and private</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {isOnTrial() && (
        <TrialBanner daysLeft={trialDaysLeft()} onUpgrade={() => setShowPricing(true)} />
      )}
<nav>
  <h1>💰 Loan Manager</h1>
  <div className="nav-links">
    {isOnTrial() && (
      <span style={{ color: '#1D9E75', fontSize: '12px' }}>
        🎁 {trialDaysLeft()} days trial
      </span>
    )}
    <button onClick={() => { setPage('dashboard'); setSelectedBorrower(null) }}>Dashboard</button>
    <button onClick={() => { setPage('borrowers'); setSelectedBorrower(null) }}>Borrowers</button>
    <button onClick={() => { setPage('loans'); setSelectedBorrower(null) }}>Loans</button>
    <button onClick={() => { setPage('reports'); setSelectedBorrower(null) }}>Reports</button>
    <button
      style={{ background: '#1D9E75', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
      onClick={() => setShowPricing(true)}
    >
      ⭐ {currentPlanName()}
    </button>
    <span style={{ color: '#fff', fontSize: '13px', opacity: 0.7 }}>
      {user.email || user.phoneNumber || 'User'}
    </span>
    <button className="btn-logout" onClick={logout}>Logout</button>
  </div>

  <button className="hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
    <span></span>
    <span></span>
    <span></span>
  </button>
</nav>

<div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
  <button onClick={() => { setPage('dashboard'); setSelectedBorrower(null); setMobileMenuOpen(false) }}>📊 Dashboard</button>
  <button onClick={() => { setPage('borrowers'); setSelectedBorrower(null); setMobileMenuOpen(false) }}>👥 Borrowers</button>
  <button onClick={() => { setPage('loans'); setSelectedBorrower(null); setMobileMenuOpen(false) }}>💰 Loans</button>
  <button onClick={() => { setPage('reports'); setSelectedBorrower(null); setMobileMenuOpen(false) }}>📋 Reports</button>
  <button onClick={() => { setShowPricing(true); setMobileMenuOpen(false) }}>⭐ {currentPlanName()} Plan</button>
  <button onClick={logout} style={{ color: '#e74c3c', borderColor: '#e74c3c' }}>🚪 Logout</button>
</div>

      <div className="content">

        {showReceipt && lastTxn && (
          <PaymentReceipt txn={lastTxn} loan={lastTxn.loan} onClose={() => { setShowReceipt(false); setLastTxn(null) }} />
        )}

        {showPricing && (
          <PricingModal
            currentPlan={userPlan.plan}
            onClose={() => setShowPricing(false)}
            onSubmitPayment={handleSubmitPayment}
          />
        )}

        {page === 'dashboard' && (
          <div>
            <h2>Dashboard</h2>

            {!canAddBorrower() && (
              <LimitBanner
                message={`You have reached the ${PLANS[userPlan.plan]?.borrowerLimit} borrower limit on your ${currentPlanName()} plan`}
                onUpgrade={() => setShowPricing(true)}
              />
            )}

            <div className="cards">
              <div className="card neutral"><p>Active Loans</p><h3>{loans.filter(l => l.status === 'active').length}</h3></div>
              <div className="card neutral"><p>Total Lent</p><h3>{loans.reduce((sum, l) => sum + l.principal, 0).toLocaleString()}</h3></div>
              <div className="card neutral"><p>Total Expected</p><h3>{loans.reduce((sum, l) => sum + l.totalExpected, 0).toLocaleString()}</h3></div>
              <div className="card green"><p>Interest Earned</p><h3>{loans.reduce((sum, l) => sum + l.interestAmount, 0).toLocaleString()}</h3></div>
              <div className="card green"><p>Paid Back</p><h3>{loans.reduce((sum, l) => sum + (l.totalExpected - l.remainingBalance), 0).toLocaleString()}</h3></div>
              <div className="card neutral"><p>Remaining Balance</p><h3>{loans.reduce((sum, l) => sum + l.remainingBalance, 0).toLocaleString()}</h3></div>
              <div className="card red"><p>Overdue Loans</p><h3>{loans.filter(l => l.status === 'overdue').length}</h3></div>
            </div>

            {transactions.length > 0 && (
              <div className="profile-card" style={{ marginTop: '24px' }}>
                <h3>Recent Transactions</h3>
                <table className="report-table">
                  <thead><tr><th>TXN Code</th><th>Borrower</th><th>Amount</th><th>Method</th><th>Date</th><th>Installments</th></tr></thead>
                  <tbody>
                    {transactions.slice(-5).reverse().map((txn, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, color: '#1a1a2e' }}>{txn.txnCode}</td>
                        <td>{txn.borrowerName}</td>
                        <td style={{ color: '#1D9E75', fontWeight: 600 }}>{txn.currency} {txn.amountPaid.toLocaleString()}</td>
                        <td>{txn.method}</td>
                        <td>{txn.datePaid}</td>
                        <td>{txn.installmentsCovered?.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {page === 'borrowers' && !selectedBorrower && (
          <div>
            <div className="page-header">
              <h2>Borrowers</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '13px', color: '#888' }}>
                  {borrowers.length}/{PLANS[userPlan.plan]?.borrowerLimit || '∞'}
                </span>
                <button className="btn-primary" onClick={() => { if (!canAddBorrower()) { setShowPricing(true) } else { setShowModal(true) } }}>
                  + Add Borrower
                </button>
              </div>
            </div>

            {!canAddBorrower() && (
              <LimitBanner
                message={`Borrower limit reached on ${currentPlanName()} plan`}
                onUpgrade={() => setShowPricing(true)}
              />
            )}

            {borrowers.length === 0 ? (
              <div className="no-borrowers"><p>No borrowers yet. Add your first borrower!</p></div>
            ) : (
              <div className="borrower-list">
                {borrowers.map((borrower, index) => {
                  const stats = getBorrowerStats(borrower.name)
                  return (
                    <div className="borrower-card" key={index} onClick={() => setSelectedBorrower(borrower)}>
                      <div className="borrower-info">
                        <h4>{borrower.name}</h4>
                        <p>{borrower.phone} · ID: {borrower.idNumber}</p>
                        <p>{borrower.email}</p>
                        <p>{stats.totalLoans} loan(s) · {stats.activeLoans > 0 ? <span style={{ color: '#E8593C' }}> 🟡 Active</span> : <span style={{ color: '#1D9E75' }}> ✅ Clear</span>}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <button className="btn-danger" onClick={(e) => { e.stopPropagation(); deleteBorrower(borrower.id) }}>Delete</button>
                        <span style={{ fontSize: '12px', color: '#888' }}>Tap to view →</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {showModal && (
              <div className="modal-overlay">
                <div className="modal">
                  <h3>Add New Borrower</h3>
                  <div className="form-group"><label>Full Name *</label><input type="text" placeholder="e.g. John Kamau" value={newBorrower.name} onChange={(e) => setNewBorrower({ ...newBorrower, name: e.target.value })} /></div>
                  <div className="form-group"><label>Phone Number *</label><input type="text" placeholder="e.g. 0712 345 678" value={newBorrower.phone} onChange={(e) => setNewBorrower({ ...newBorrower, phone: e.target.value })} /></div>
                  <div className="form-group"><label>ID Number *</label><input type="text" placeholder="e.g. 12345678" value={newBorrower.idNumber} onChange={(e) => setNewBorrower({ ...newBorrower, idNumber: e.target.value })} /></div>
                  <div className="form-group"><label>Email Address *</label><input type="email" placeholder="e.g. john@email.com" value={newBorrower.email} onChange={(e) => setNewBorrower({ ...newBorrower, email: e.target.value })} /></div>
                  <div className="form-group"><label>Notes (optional)</label><textarea placeholder="e.g. Friend, works at KCB" rows="3" value={newBorrower.notes} onChange={(e) => setNewBorrower({ ...newBorrower, notes: e.target.value })} /></div>
                  <div className="form-group"><label><input type="checkbox" /> I confirm this borrower has consented to their data being stored</label></div>
                  <div className="modal-buttons">
                    <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                    <button className="btn-primary" onClick={saveBorrower}>Save Borrower</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {page === 'borrowers' && selectedBorrower && (
          <div>
            <div className="page-header">
              <button className="btn-secondary" onClick={() => setSelectedBorrower(null)}>← Back</button>
              <h2>{selectedBorrower.name}</h2>
            </div>
            <div className="profile-section">
              <div className="profile-card">
                <h3>Profile</h3>
                <div className="profile-row"><span>Full Name</span><span>{selectedBorrower.name}</span></div>
                <div className="profile-row"><span>Phone</span><span>{selectedBorrower.phone}</span></div>
                <div className="profile-row"><span>ID Number</span><span>{selectedBorrower.idNumber}</span></div>
                <div className="profile-row"><span>Email</span><span>{selectedBorrower.email}</span></div>
                {selectedBorrower.notes && <div className="profile-row"><span>Notes</span><span>{selectedBorrower.notes}</span></div>}
              </div>
              <div className="profile-card">
                <h3>Analytics</h3>
                {(() => {
                  const stats = getBorrowerStats(selectedBorrower.name)
                  return (
                    <div>
                      <div className="profile-row"><span>Total Loans Taken</span><span>{stats.totalLoans}</span></div>
                      <div className="profile-row"><span>Active Loans</span><span>{stats.activeLoans}</span></div>
                      <div className="profile-row"><span>Cleared Loans</span><span>{stats.clearedLoans}</span></div>
                      <div className="profile-row"><span>Total Ever Borrowed</span><span>{stats.totalBorrowed.toLocaleString()}</span></div>
                      <div className="profile-row"><span>Total Expected Back</span><span>{stats.totalExpected.toLocaleString()}</span></div>
                      <div className="profile-row"><span>Total Paid</span><span style={{ color: '#1D9E75', fontWeight: 600 }}>{stats.totalPaid.toLocaleString()}</span></div>
                      <div className="profile-row"><span>Currently Owing</span><span style={{ color: '#e74c3c', fontWeight: 600 }}>{stats.totalOwing.toLocaleString()}</span></div>
                    </div>
                  )
                })()}
              </div>
            </div>
            <div className="profile-card" style={{ marginTop: '16px' }}>
              <h3>Loan History</h3>
              {getBorrowerLoans(selectedBorrower.name).length === 0 ? (
                <p style={{ color: '#888', padding: '16px 0' }}>No loans yet for this borrower.</p>
              ) : (
                <table className="report-table">
                  <thead><tr><th>Principal</th><th>Interest</th><th>Total</th><th>Remaining</th><th>Frequency</th><th>Next Due</th><th>Status</th></tr></thead>
                  <tbody>
                    {getBorrowerLoans(selectedBorrower.name).map((loan, i) => (
                      <tr key={i}>
                        <td>{loan.currency} {loan.principal.toLocaleString()}</td>
                        <td>{loan.currency} {loan.interestAmount.toLocaleString()}</td>
                        <td>{loan.currency} {loan.totalExpected.toLocaleString()}</td>
                        <td>{loan.currency} {loan.remainingBalance.toLocaleString()}</td>
                        <td>{loan.frequency}</td>
                        <td>{loan.nextDueDate}</td>
                        <td><span className={`status-badge status-${loan.status}`}>{loan.status === 'active' && '🟡 Active'}{loan.status === 'cleared' && '✅ Cleared'}{loan.status === 'overdue' && '🔴 Overdue'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="profile-card" style={{ marginTop: '16px' }}>
              <h3>Transaction History</h3>
              {getBorrowerLoans(selectedBorrower.name).length === 0 ? (
                <p style={{ color: '#888', padding: '16px 0' }}>No transactions yet.</p>
              ) : (
                <table className="report-table">
                  <thead><tr><th>TXN Code</th><th>Amount Paid</th><th>Method</th><th>Reference</th><th>Date</th><th>Installments</th><th>Balance After</th></tr></thead>
                  <tbody>
                    {getBorrowerLoans(selectedBorrower.name).flatMap(loan =>
                      getLoanTransactions(loan.id).map((txn, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600, color: '#1a1a2e' }}>{txn.txnCode}</td>
                          <td style={{ color: '#1D9E75', fontWeight: 600 }}>{txn.currency} {txn.amountPaid.toLocaleString()}</td>
                          <td>{txn.method}</td>
                          <td>{txn.referenceCode}</td>
                          <td>{txn.datePaid}</td>
                          <td>{txn.installmentsCovered?.join(', ')}</td>
                          <td style={{ color: '#e74c3c', fontWeight: 600 }}>{txn.currency} {txn.remainingBalance.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {page === 'loans' && (
          <div>
            <div className="page-header">
              <h2>Loans</h2>
              <button className="btn-primary" onClick={() => { if (!canAddLoan()) { setShowPricing(true) } else { setShowLoanModal(true) } }}>
                + Add Loan
              </button>
            </div>

            {!canAddLoan() && (
              <LimitBanner
                message={`Loan limit reached on ${currentPlanName()} plan`}
                onUpgrade={() => setShowPricing(true)}
              />
            )}

            {loans.length === 0 ? (
              <div className="no-borrowers"><p>No loans yet. Add your first loan!</p></div>
            ) : (
              <div>
                {loans.map((loan, index) => (
                  <div className="loan-card" key={index} onClick={() => { setSelectedLoan(loan); setShowLoanDetail(true) }} style={{ cursor: 'pointer' }}>
                    <div className="loan-card-header">
                      <h4>{loan.borrowerName}</h4>
                      <span className={`status-badge status-${loan.status}`}>
                        {loan.status === 'active' && '🟡 Active'}
                        {loan.status === 'cleared' && '✅ Cleared'}
                        {loan.status === 'overdue' && '🔴 Overdue'}
                      </span>
                    </div>
                    <div className="loan-card-details">
                      <div className="loan-detail-item"><p>Principal</p><h5>{loan.currency} {loan.principal.toLocaleString()}</h5></div>
                      <div className="loan-detail-item"><p>Total Expected</p><h5>{loan.currency} {loan.totalExpected.toLocaleString()}</h5></div>
                      <div className="loan-detail-item"><p>Remaining</p><h5>{loan.currency} {loan.remainingBalance.toLocaleString()}</h5></div>
                      <div className="loan-detail-item"><p>Interest</p><h5>{loan.currency} {loan.interestAmount.toLocaleString()}</h5></div>
                      <div className="loan-detail-item"><p>Frequency</p><h5>{loan.frequency}</h5></div>
                      <div className="loan-detail-item"><p>Next Due</p><h5>{loan.nextDueDate}</h5></div>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${((loan.totalExpected - loan.remainingBalance) / loan.totalExpected) * 100}%` }} />
                    </div>
                    <p style={{ fontSize: '12px', color: '#888', marginTop: '8px', textAlign: 'right' }}>Tap to view details →</p>
                  </div>
                ))}
              </div>
            )}

            {showLoanDetail && selectedLoan && (
              <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3>{selectedLoan.borrowerName} — Loan Details</h3>
                    <button className="btn-secondary" onClick={() => setShowLoanDetail(false)}>✕ Close</button>
                  </div>
                  <div className="loan-summary-box">
                    <h4>Loan Summary</h4>
                    <div className="loan-summary-row"><span>Principal</span><span>{selectedLoan.currency} {selectedLoan.principal.toLocaleString()}</span></div>
                    <div className="loan-summary-row"><span>Interest ({selectedLoan.interestRate}%)</span><span>{selectedLoan.currency} {selectedLoan.interestAmount.toLocaleString()}</span></div>
                    <div className="loan-summary-row total"><span>Total Payable</span><span>{selectedLoan.currency} {selectedLoan.totalExpected.toLocaleString()}</span></div>
                    <div className="loan-summary-row"><span>Paid So Far</span><span style={{ color: '#1D9E75', fontWeight: 600 }}>{selectedLoan.currency} {(selectedLoan.totalExpected - selectedLoan.remainingBalance).toLocaleString()}</span></div>
                    <div className="loan-summary-row"><span>Remaining Balance</span><span style={{ color: '#e74c3c', fontWeight: 600 }}>{selectedLoan.currency} {selectedLoan.remainingBalance.toLocaleString()}</span></div>
                    <div className="loan-summary-row"><span>Frequency</span><span>{selectedLoan.frequency}</span></div>
                    <div className="loan-summary-row"><span>Status</span><span><span className={`status-badge status-${selectedLoan.status}`}>{selectedLoan.status === 'active' && '🟡 Active'}{selectedLoan.status === 'cleared' && '✅ Cleared'}{selectedLoan.status === 'overdue' && '🔴 Overdue'}</span></span></div>
                  </div>
                  <div style={{ marginTop: '20px' }}>
                    <h4 style={{ marginBottom: '12px', color: '#1a1a2e' }}>Installment Schedule</h4>
                    <table className="report-table">
                      <thead><tr><th>#</th><th>Due Date</th><th>Amount Due</th><th>Amount Paid</th><th>TXN Code</th><th>Status</th></tr></thead>
                      <tbody>
                        {(selectedLoan.installments || []).map((inst, i) => (
                          <tr key={i}>
                            <td>{inst.number}</td>
                            <td>{inst.dueDate}</td>
                            <td>{selectedLoan.currency} {inst.amountDue.toLocaleString()}</td>
                            <td style={{ color: '#1D9E75', fontWeight: 600 }}>{selectedLoan.currency} {(inst.amountPaid || 0).toLocaleString()}</td>
                            <td style={{ fontSize: '12px', color: '#666' }}>{inst.txnCode || '—'}</td>
                            <td>
                              {inst.status === 'paid' && <span className="status-badge status-cleared">✅ Paid</span>}
                              {inst.status === 'partial' && <span className="status-badge status-active">⚠️ Partial</span>}
                              {inst.status === 'pending' && <span className="status-badge" style={{ background: '#f0f2f5', color: '#888' }}>⏳ Pending</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {getLoanTransactions(selectedLoan.id).length > 0 && (
                    <div style={{ marginTop: '20px' }}>
                      <h4 style={{ marginBottom: '12px', color: '#1a1a2e' }}>Transaction History</h4>
                      <table className="report-table">
                        <thead><tr><th>TXN Code</th><th>Amount</th><th>Method</th><th>Reference</th><th>Date</th><th>Balance After</th></tr></thead>
                        <tbody>
                          {getLoanTransactions(selectedLoan.id).map((txn, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600, color: '#1a1a2e' }}>{txn.txnCode}</td>
                              <td style={{ color: '#1D9E75', fontWeight: 600 }}>{txn.currency} {txn.amountPaid.toLocaleString()}</td>
                              <td>{txn.method}</td>
                              <td>{txn.referenceCode}</td>
                              <td>{txn.datePaid}</td>
                              <td style={{ color: '#e74c3c', fontWeight: 600 }}>{txn.currency} {txn.remainingBalance.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {selectedLoan.status !== 'cleared' && (
                    <div style={{ marginTop: '20px' }}>
                      <button className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '15px' }} onClick={() => { setShowLoanDetail(false); setShowPaymentModal(true) }}>
                        💳 Record Payment
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {showPaymentModal && selectedLoan && (
              <div className="modal-overlay">
                <div className="modal">
                  <h3>Record Payment — {selectedLoan.borrowerName}</h3>
                  <div className="loan-summary-box" style={{ marginBottom: '20px' }}>
                    <div className="loan-summary-row"><span>Remaining Balance</span><span style={{ color: '#e74c3c', fontWeight: 600 }}>{selectedLoan.currency} {selectedLoan.remainingBalance.toLocaleString()}</span></div>
                    <div className="loan-summary-row"><span>Installment Amount</span><span>{selectedLoan.currency} {selectedLoan.installmentAmount.toLocaleString()}</span></div>
                  </div>
                  <div className="form-group"><label>Amount Paid *</label><input type="number" placeholder={`e.g. ${selectedLoan.installmentAmount}`} value={paymentData.amountPaid} onChange={(e) => setPaymentData({ ...paymentData, amountPaid: e.target.value })} /></div>
                  <div className="form-group">
                    <label>Payment Method *</label>
                    <select className="select-input" value={paymentData.method} onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value })}>
                      <option value="M-Pesa">M-Pesa</option>
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Airtel Money">Airtel Money</option>
                      <option value="T-Kash">T-Kash</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group"><label>Reference Code *</label><input type="text" placeholder="e.g. ABC123XYZ (M-Pesa code)" value={paymentData.referenceCode} onChange={(e) => setPaymentData({ ...paymentData, referenceCode: e.target.value })} /></div>
                  <div className="form-group"><label>Date Paid *</label><input type="date" value={paymentData.datePaid} onChange={(e) => setPaymentData({ ...paymentData, datePaid: e.target.value })} /></div>
                  <div className="form-group"><label>Notes (optional)</label><textarea placeholder="Any additional notes" rows="2" value={paymentData.notes} onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })} /></div>
                  {paymentData.amountPaid && (
                    <div className="loan-summary-box">
                      <h4>Payment Preview</h4>
                      <div className="loan-summary-row"><span>Amount Paying</span><span>{selectedLoan.currency} {Number(paymentData.amountPaid).toLocaleString()}</span></div>
                      <div className="loan-summary-row"><span>Balance After Payment</span><span style={{ color: '#e74c3c', fontWeight: 600 }}>{selectedLoan.currency} {Math.max(0, selectedLoan.remainingBalance - Number(paymentData.amountPaid)).toLocaleString()}</span></div>
                      <div className="loan-summary-row">
                        <span>Loan Status After</span>
                        <span>{Number(paymentData.amountPaid) >= selectedLoan.remainingBalance ? <span style={{ color: '#1D9E75', fontWeight: 600 }}>✅ Will be Cleared</span> : <span style={{ color: '#E8593C' }}>🟡 Still Active</span>}</span>
                      </div>
                    </div>
                  )}
                  <div className="modal-buttons">
                    <button className="btn-secondary" onClick={() => { setShowPaymentModal(false); setShowLoanDetail(true) }}>← Back</button>
                    <button className="btn-primary" onClick={recordPayment}>💳 Confirm Payment</button>
                  </div>
                </div>
              </div>
            )}

            {showLoanModal && (
              <div className="modal-overlay">
                <div className="modal">
                  <h3>Add New Loan</h3>
                  <div className="form-group">
                    <label>Select Borrower *</label>
                    <select className="select-input" value={newLoan.borrowerName} onChange={(e) => setNewLoan({ ...newLoan, borrowerName: e.target.value })}>
                      <option value="">-- Select borrower --</option>
                      {borrowers.map((b, i) => <option key={i} value={b.name}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Currency *</label>
                    <select className="select-input" value={newLoan.currency} onChange={(e) => setNewLoan({ ...newLoan, currency: e.target.value })}>
                      <optgroup label="Africa">
                        <option value="KSh">KSh — Kenyan Shilling</option>
                        <option value="UGX">UGX — Ugandan Shilling</option>
                        <option value="TZS">TZS — Tanzanian Shilling</option>
                        <option value="NGN">NGN — Nigerian Naira</option>
                        <option value="ZAR">ZAR — South African Rand</option>
                        <option value="GHS">GHS — Ghanaian Cedi</option>
                        <option value="ETB">ETB — Ethiopian Birr</option>
                        <option value="RWF">RWF — Rwandan Franc</option>
                        <option value="XOF">XOF — West African CFA Franc</option>
                        <option value="XAF">XAF — Central African CFA Franc</option>
                        <option value="ZMW">ZMW — Zambian Kwacha</option>
                        <option value="MWK">MWK — Malawian Kwacha</option>
                        <option value="MZN">MZN — Mozambican Metical</option>
                        <option value="BWP">BWP — Botswana Pula</option>
                        <option value="NAD">NAD — Namibian Dollar</option>
                        <option value="SOS">SOS — Somali Shilling</option>
                        <option value="SDG">SDG — Sudanese Pound</option>
                        <option value="DZD">DZD — Algerian Dinar</option>
                        <option value="MAD">MAD — Moroccan Dirham</option>
                        <option value="EGP">EGP — Egyptian Pound</option>
                        <option value="TND">TND — Tunisian Dinar</option>
                        <option value="LYD">LYD — Libyan Dinar</option>
                        <option value="AOA">AOA — Angolan Kwanza</option>
                        <option value="CDF">CDF — Congolese Franc</option>
                        <option value="MGA">MGA — Malagasy Ariary</option>
                        <option value="MUR">MUR — Mauritian Rupee</option>
                        <option value="SCR">SCR — Seychellois Rupee</option>
                      </optgroup>
                      <optgroup label="Americas">
                        <option value="USD">USD — US Dollar</option>
                        <option value="CAD">CAD — Canadian Dollar</option>
                        <option value="MXN">MXN — Mexican Peso</option>
                        <option value="BRL">BRL — Brazilian Real</option>
                        <option value="ARS">ARS — Argentine Peso</option>
                        <option value="CLP">CLP — Chilean Peso</option>
                        <option value="COP">COP — Colombian Peso</option>
                        <option value="PEN">PEN — Peruvian Sol</option>
                        <option value="UYU">UYU — Uruguayan Peso</option>
                        <option value="PYG">PYG — Paraguayan Guaraní</option>
                        <option value="BOB">BOB — Bolivian Boliviano</option>
                        <option value="VES">VES — Venezuelan Bolívar</option>
                        <option value="GTQ">GTQ — Guatemalan Quetzal</option>
                        <option value="CRC">CRC — Costa Rican Colón</option>
                        <option value="JMD">JMD — Jamaican Dollar</option>
                        <option value="TTD">TTD — Trinidad Dollar</option>
                      </optgroup>
                      <optgroup label="Europe">
                        <option value="EUR">EUR — Euro</option>
                        <option value="GBP">GBP — British Pound</option>
                        <option value="CHF">CHF — Swiss Franc</option>
                        <option value="NOK">NOK — Norwegian Krone</option>
                        <option value="SEK">SEK — Swedish Krona</option>
                        <option value="DKK">DKK — Danish Krone</option>
                        <option value="PLN">PLN — Polish Zloty</option>
                        <option value="CZK">CZK — Czech Koruna</option>
                        <option value="HUF">HUF — Hungarian Forint</option>
                        <option value="RON">RON — Romanian Leu</option>
                        <option value="HRK">HRK — Croatian Kuna</option>
                        <option value="RUB">RUB — Russian Ruble</option>
                        <option value="UAH">UAH — Ukrainian Hryvnia</option>
                        <option value="TRY">TRY — Turkish Lira</option>
                      </optgroup>
                      <optgroup label="Asia">
                        <option value="CNY">CNY — Chinese Yuan</option>
                        <option value="JPY">JPY — Japanese Yen</option>
                        <option value="INR">INR — Indian Rupee</option>
                        <option value="KRW">KRW — South Korean Won</option>
                        <option value="IDR">IDR — Indonesian Rupiah</option>
                        <option value="MYR">MYR — Malaysian Ringgit</option>
                        <option value="SGD">SGD — Singapore Dollar</option>
                        <option value="THB">THB — Thai Baht</option>
                        <option value="VND">VND — Vietnamese Dong</option>
                        <option value="PHP">PHP — Philippine Peso</option>
                        <option value="PKR">PKR — Pakistani Rupee</option>
                        <option value="BDT">BDT — Bangladeshi Taka</option>
                        <option value="NPR">NPR — Nepalese Rupee</option>
                        <option value="LKR">LKR — Sri Lankan Rupee</option>
                        <option value="MMK">MMK — Myanmar Kyat</option>
                        <option value="KHR">KHR — Cambodian Riel</option>
                      </optgroup>
                      <optgroup label="Middle East">
                        <option value="AED">AED — UAE Dirham</option>
                        <option value="SAR">SAR — Saudi Riyal</option>
                        <option value="QAR">QAR — Qatari Riyal</option>
                        <option value="KWD">KWD — Kuwaiti Dinar</option>
                        <option value="BHD">BHD — Bahraini Dinar</option>
                        <option value="OMR">OMR — Omani Rial</option>
                        <option value="JOD">JOD — Jordanian Dinar</option>
                        <option value="ILS">ILS — Israeli Shekel</option>
                        <option value="IQD">IQD — Iraqi Dinar</option>
                        <option value="IRR">IRR — Iranian Rial</option>
                      </optgroup>
                      <optgroup label="Oceania">
                        <option value="AUD">AUD — Australian Dollar</option>
                        <option value="NZD">NZD — New Zealand Dollar</option>
                        <option value="FJD">FJD — Fijian Dollar</option>
                        <option value="PGK">PGK — Papua New Guinea Kina</option>
                      </optgroup>
                    </select>
                  </div>
                  <div className="form-group"><label>Principal Amount *</label><input type="number" placeholder="e.g. 10000" value={newLoan.principal} onChange={(e) => setNewLoan({ ...newLoan, principal: e.target.value })} /></div>
                  <div className="form-group"><label>Interest Rate (%) *</label><input type="number" placeholder="e.g. 10" value={newLoan.interestRate} onChange={(e) => setNewLoan({ ...newLoan, interestRate: e.target.value })} /></div>
                  <div className="form-group"><label>Duration *</label><input type="number" placeholder="e.g. 3" value={newLoan.duration} onChange={(e) => setNewLoan({ ...newLoan, duration: e.target.value })} /></div>
                  <div className="form-group">
                    <label>Payment Frequency *</label>
                    <select className="select-input" value={newLoan.frequency} onChange={(e) => setNewLoan({ ...newLoan, frequency: e.target.value })}>
                      <option value="Monthly">Monthly</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Daily">Daily</option>
                    </select>
                  </div>
                  <div className="form-group"><label>Start Date *</label><input type="date" value={newLoan.startDate} onChange={(e) => setNewLoan({ ...newLoan, startDate: e.target.value })} /></div>
                  <div className="form-group"><label>Notes (optional)</label><textarea placeholder="e.g. For school fees" rows="2" value={newLoan.notes} onChange={(e) => setNewLoan({ ...newLoan, notes: e.target.value })} /></div>
                  {newLoan.principal && newLoan.interestRate && newLoan.duration && (
                    <div className="loan-summary-box">
                      <h4>Loan Summary</h4>
                      <div className="loan-summary-row"><span>Principal</span><span>{newLoan.currency} {Number(newLoan.principal).toLocaleString()}</span></div>
                      <div className="loan-summary-row"><span>Interest ({newLoan.interestRate}%)</span><span>{newLoan.currency} {(newLoan.principal * newLoan.interestRate / 100).toLocaleString()}</span></div>
                      <div className="loan-summary-row total"><span>Total Payable</span><span>{newLoan.currency} {(Number(newLoan.principal) + Number(newLoan.principal) * newLoan.interestRate / 100).toLocaleString()}</span></div>
                      <div className="loan-summary-row"><span>Installment Amount</span><span>{newLoan.currency} {Math.ceil((Number(newLoan.principal) + Number(newLoan.principal) * newLoan.interestRate / 100) / newLoan.duration).toLocaleString()}</span></div>
                    </div>
                  )}
                  <div className="modal-buttons">
                    <button className="btn-secondary" onClick={() => setShowLoanModal(false)}>Cancel</button>
                    <button className="btn-primary" onClick={saveLoan}>Save Loan</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {page === 'reports' && (
          <div>
            <div className="page-header"><h2>Reports</h2></div>
            <div className="cards" style={{ marginBottom: '24px' }}>
              <div className="card neutral"><p>Total Loans Issued</p><h3>{loans.length}</h3></div>
              <div className="card neutral"><p>Total Lent Out</p><h3>{loans.reduce((sum, l) => sum + l.principal, 0).toLocaleString()}</h3></div>
              <div className="card green"><p>Total Interest</p><h3>{loans.reduce((sum, l) => sum + l.interestAmount, 0).toLocaleString()}</h3></div>
              <div className="card green"><p>Total Collected</p><h3>{loans.reduce((sum, l) => sum + (l.totalExpected - l.remainingBalance), 0).toLocaleString()}</h3></div>
              <div className="card neutral"><p>Total Outstanding</p><h3>{loans.reduce((sum, l) => sum + l.remainingBalance, 0).toLocaleString()}</h3></div>
              <div className="card red"><p>Overdue Loans</p><h3>{loans.filter(l => l.status === 'overdue').length}</h3></div>
            </div>
            <div className="profile-card">
              <h3>All Transactions</h3>
              {transactions.length === 0 ? (
                <p style={{ color: '#888', padding: '16px 0' }}>No transactions recorded yet.</p>
              ) : (
                <table className="report-table">
                  <thead><tr><th>TXN Code</th><th>Borrower</th><th>Amount Paid</th><th>Method</th><th>Reference</th><th>Date</th><th>Installments</th><th>Balance After</th></tr></thead>
                  <tbody>
                    {transactions.map((txn, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, color: '#1a1a2e' }}>{txn.txnCode}</td>
                        <td>{txn.borrowerName}</td>
                        <td style={{ color: '#1D9E75', fontWeight: 600 }}>{txn.currency} {txn.amountPaid.toLocaleString()}</td>
                        <td>{txn.method}</td>
                        <td>{txn.referenceCode}</td>
                        <td>{txn.datePaid}</td>
                        <td>{txn.installmentsCovered?.join(', ')}</td>
                        <td style={{ color: '#e74c3c', fontWeight: 600 }}>{txn.currency} {txn.remainingBalance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="profile-card" style={{ marginTop: '16px' }}>
              <h3>All Loans</h3>
              {loans.length === 0 ? (
                <p style={{ color: '#888', padding: '16px 0' }}>No loans recorded yet.</p>
              ) : (
                <table className="report-table">
                  <thead><tr><th>Borrower</th><th>Principal</th><th>Interest</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Frequency</th><th>Next Due</th><th>Status</th></tr></thead>
                  <tbody>
                    {loans.map((loan, i) => (
                      <tr key={i}>
                        <td>{loan.borrowerName}</td>
                        <td>{loan.currency} {loan.principal.toLocaleString()}</td>
                        <td>{loan.currency} {loan.interestAmount.toLocaleString()}</td>
                        <td>{loan.currency} {loan.totalExpected.toLocaleString()}</td>
                        <td style={{ color: '#1D9E75', fontWeight: 600 }}>{loan.currency} {(loan.totalExpected - loan.remainingBalance).toLocaleString()}</td>
                        <td style={{ color: '#e74c3c', fontWeight: 600 }}>{loan.currency} {loan.remainingBalance.toLocaleString()}</td>
                        <td>{loan.frequency}</td>
                        <td>{loan.nextDueDate}</td>
                        <td><span className={`status-badge status-${loan.status}`}>{loan.status === 'active' && '🟡 Active'}{loan.status === 'cleared' && '✅ Cleared'}{loan.status === 'overdue' && '🔴 Overdue'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="profile-card" style={{ marginTop: '16px' }}>
              <h3>Borrower Summary</h3>
              {borrowers.length === 0 ? (
                <p style={{ color: '#888', padding: '16px 0' }}>No borrowers recorded yet.</p>
              ) : (
                <table className="report-table">
                  <thead><tr><th>Borrower</th><th>Phone</th><th>Total Loans</th><th>Total Borrowed</th><th>Total Paid</th><th>Owing</th><th>Status</th></tr></thead>
                  <tbody>
                    {borrowers.map((borrower, i) => {
                      const stats = getBorrowerStats(borrower.name)
                      return (
                        <tr key={i}>
                          <td>{borrower.name}</td>
                          <td>{borrower.phone}</td>
                          <td>{stats.totalLoans}</td>
                          <td>{stats.totalBorrowed.toLocaleString()}</td>
                          <td style={{ color: '#1D9E75', fontWeight: 600 }}>{stats.totalPaid.toLocaleString()}</td>
                          <td style={{ color: '#e74c3c', fontWeight: 600 }}>{stats.totalOwing.toLocaleString()}</td>
                          <td>{stats.activeLoans > 0 ? <span className="status-badge status-active">🟡 Active</span> : <span className="status-badge status-cleared">✅ Clear</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default App