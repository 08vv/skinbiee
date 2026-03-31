import os
import numpy as np
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.layers import GlobalAveragePooling2D, Dense, Dropout
from tensorflow.keras.models import Model

def main():
    # Define classes
    classes = ['acne', 'dark_spots', 'dry_skin', 'normal_skin', 'oily_skin']
    
    print("Building MobileNetV2 base model...")
    base_model = MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights='imagenet')
    
    # Freeze base model
    base_model.trainable = False
    
    print("Adding custom classification head...")
    x = base_model.output
    x = GlobalAveragePooling2D()(x)
    x = Dense(128, activation='relu')(x)
    x = Dropout(0.3)(x)
    predictions = Dense(5, activation='softmax')(x)
    
    model = Model(inputs=base_model.input, outputs=predictions)
    
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
                  loss='categorical_crossentropy',
                  metrics=['accuracy'])
    
    # Create dummy training data to initialize variables and verify flow
    print("Generating dummy data for mock run...")
    X_dummy = np.random.rand(10, 224, 224, 3).astype('float32')
    y_dummy = tf.keras.utils.to_categorical(np.random.randint(0, 5, 10), num_classes=5)
    
    print("Running 1 dummy epoch...")
    model.fit(X_dummy, y_dummy, epochs=1, batch_size=2, verbose=1)
    
    save_path = os.path.join(os.path.dirname(__file__), '..', 'models', 'skin_model.h5')
    save_path = os.path.abspath(save_path)
    print(f"Saving model to {save_path}...")
    model.save(save_path)
    print("Mock model saved successfully.")

if __name__ == '__main__':
    main()
