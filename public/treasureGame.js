// وظائف لعبة البحث عن الكنز المخفي

// إضافة الأدلة إلى المشهد
function addClues(scene, availableClues) {
    const clues = [];
    // إضافة أدلة مخفية في المشهد
    const clueGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const clueMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x00FF00, 
        emissive: 0x00FF00, 
        emissiveIntensity: 0.5 
    });
    
    // إضافة الأدلة من القائمة المتاحة
    for (let i = 0; i < availableClues.length; i++) {
        const clueObj = new THREE.Mesh(clueGeometry, clueMaterial);
        
        // تحديد موقع الدليل
        clueObj.position.copy(availableClues[i].position);
        clueObj.userData = {
            type: 'clue',
            index: i,
            title: availableClues[i].title,
            description: availableClues[i].description
        };
        
        scene.add(clueObj);
        clues.push(clueObj);
    }
    
    return clues;
}

// إضافة الكنز المخفي
function addHiddenTreasure(scene, clues) {
    // إضافة الكنز المخفي
    const treasureGeometry = new THREE.BoxGeometry(1, 1, 1);
    const treasureMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xFFD700, 
        metalness: 1.0,
        roughness: 0.3,
        emissive: 0xFFD700,
        emissiveIntensity: 0.2
    });
    
    const hiddenTreasure = new THREE.Mesh(treasureGeometry, treasureMaterial);
    
    // تحديد موقع عشوائي للكنز بعيدًا عن الأدلة
    let validPosition = false;
    while (!validPosition) {
        hiddenTreasure.position.x = Math.random() * 40 - 20;
        hiddenTreasure.position.y = 0.5;
        hiddenTreasure.position.z = Math.random() * 40 - 20;
        
        // التأكد من أن الكنز ليس قريبًا جدًا من أي دليل
        validPosition = true;
        for (const clue of clues) {
            if (hiddenTreasure.position.distanceTo(clue.position) < 10) {
                validPosition = false;
                break;
            }
        }
    }
    
    hiddenTreasure.userData = {
        type: 'treasure'
    };
    
    scene.add(hiddenTreasure);
    return hiddenTreasure;
}

// التحقق من الاصطدامات مع الأدلة والكنز
function checkTreasureCollisions(character, clues, hiddenTreasure, discoveredClues, socket, roomId, playerName) {
    // التحقق من الاصطدام مع الأدلة
    for (let i = 0; i < clues.length; i++) {
        const clue = clues[i];
        if (!discoveredClues.includes(i) && character.position.distanceTo(clue.position) < 2) {
            // العثور على دليل جديد
            discoveredClues.push(i);
            
            // إظهار رسالة للاعب
            showMessage(clue.userData.title, clue.userData.description);
            
            // تحديث معلومات الدليل
            updateClueInfo(clue.userData.description);
            
            // إرسال إشعار للاعبين الآخرين
            if (socket && socket.connected) {
                socket.emit('clue-found', { roomId, clueIndex: i });
            }
            
            // تغيير لون الدليل ليظهر أنه تم اكتشافه
            clue.material.color.set(0xFFFFFF);
            clue.material.emissive.set(0xFFFFFF);
        }
    }
    
    // التحقق من الاصطدام مع الكنز
    if (hiddenTreasure && character.position.distanceTo(hiddenTreasure.position) < 2) {
        // العثور على الكنز
        showMessage("تهانينا!", "لقد عثرت على الكنز المخفي!");
        
        // إرسال إشعار للاعبين الآخرين
        if (socket && socket.connected) {
            socket.emit('treasure-found', { roomId, playerName });
        }
        
        // إخفاء الكنز
        hiddenTreasure.visible = false;
        
        return true; // تم العثور على الكنز
    }
    
    return false;
}

// تحديث معلومات الدليل في واجهة المستخدم
function updateClueInfo(description) {
    const clueInfo = document.getElementById('clue-info');
    if (clueInfo) {
        clueInfo.textContent = `الدليل: ${description}`;
    }
}

// إظهار رسالة للاعب
function showMessage(title, content) {
    const messageBox = document.getElementById('message-box');
    const messageTitle = document.getElementById('message-title');
    const messageContent = document.getElementById('message-content');
    
    messageTitle.textContent = title;
    messageContent.textContent = content;
    messageBox.style.display = 'block';
}
