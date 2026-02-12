import React, { useState } from 'react';
import './Login.css';

const avatarSeeds = ['Felix', 'Aneka', 'Zoe', 'Midnight', 'Bear', 'Tiger', 'Lilly', 'Boots'];

const Login = ({ onLogin }) => {
    const [nickname, setNickname] = useState('');
    const [age, setAge] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState(avatarSeeds[0]);

    const handleLogin = (e) => {
        e.preventDefault();
        if (nickname.trim() && age) {
            onLogin({ nickname, age, avatarSeed: selectedAvatar });
        }
    };

    return (
        <div className="login-overlay">
            <div className="login-box glass-panel">
                <div className="login-header">
                    <h2>Welcome to Knot 💬</h2>
                    <p>Setup your profile to start matching</p>
                </div>

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label>Avatar</label>
                        <div className="avatar-selection">
                            {avatarSeeds.map(seed => (
                                <img
                                    key={seed}
                                    src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`}
                                    alt={seed}
                                    className={`avatar-option ${selectedAvatar === seed ? 'selected' : ''}`}
                                    onClick={() => setSelectedAvatar(seed)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Nickname</label>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="Enter a cool name"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Age</label>
                        <input
                            type="number"
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            placeholder="Your age"
                            required
                            min="13"
                            max="99"
                        />
                    </div>

                    <button type="submit" className="login-btn">
                        Enter Knot
                    </button>
                    <p className="disclaimer">By entering, you verify you are 13+.</p>
                </form>
            </div>
        </div>
    );
};

export default Login;
