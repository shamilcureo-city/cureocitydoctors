'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function NewPatientPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [abhaId, setAbhaId] = useState('');
  const [allergies, setAllergies] = useState('');
  const [comorbidities, setComorbidities] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      window.location.href = '/';
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Patient name is required.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      setError('A valid phone number (minimum 10 characters) is required.');
      return;
    }

    setLoading(true);

    const body: Record<string, unknown> = {
      name: name.trim(),
      phone: phone.trim(),
    };

    if (age) body.age = parseInt(age, 10);
    if (gender) body.gender = gender;
    if (bloodGroup) body.blood_group = bloodGroup;
    if (abhaId.trim()) body.abha_id = abhaId.trim();
    if (emergencyContactName.trim()) body.emergency_contact_name = emergencyContactName.trim();
    if (emergencyContactPhone.trim()) body.emergency_contact_phone = emergencyContactPhone.trim();

    const allergiesList = allergies
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (allergiesList.length > 0) body.allergies = allergiesList;

    const comorbiditiesList = comorbidities
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (comorbiditiesList.length > 0) body.comorbidities = comorbiditiesList;

    try {
      const result = await api.post<{ id: string }>('/patients', body);
      window.location.href = `/patients/${result.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register patient.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cureocity-primary focus:border-transparent outline-none';

  return (
    <div className="min-h-screen bg-cureocity-bg">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <a href="/patients" className="text-cureocity-primary hover:text-teal-800">
            &larr; Back
          </a>
          <h1 className="text-xl font-bold text-cureocity-text">Register New Patient</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-cureocity-text mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cureocity-text mb-1">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                className={inputClass}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-cureocity-text mb-1">Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Age"
                min="0"
                max="150"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cureocity-text mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={inputClass}
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-cureocity-text mb-1">
                Blood Group
              </label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className={inputClass}
              >
                <option value="">Select blood group</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-cureocity-text mb-1">ABHA ID</label>
              <input
                type="text"
                value={abhaId}
                onChange={(e) => setAbhaId(e.target.value)}
                placeholder="ABHA ID"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-cureocity-text mb-1">Allergies</label>
            <input
              type="text"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="Comma-separated (e.g., Penicillin, Peanuts, Latex)"
              className={inputClass}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-cureocity-text mb-1">
              Comorbidities
            </label>
            <input
              type="text"
              value={comorbidities}
              onChange={(e) => setComorbidities(e.target.value)}
              placeholder="Comma-separated (e.g., Diabetes, Hypertension)"
              className={inputClass}
            />
          </div>

          <div className="border-t border-slate-200 pt-4 mt-4 mb-4">
            <h3 className="text-sm font-semibold text-cureocity-text mb-3">Emergency Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cureocity-text mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Emergency contact name"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-cureocity-text mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  placeholder="Emergency contact phone"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-cureocity-primary text-white font-semibold rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
          >
            {loading ? 'Registering...' : 'Register Patient'}
          </button>
        </form>
      </main>
    </div>
  );
}
