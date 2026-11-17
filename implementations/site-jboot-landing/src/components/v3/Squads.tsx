"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import { v3Content } from "@/content/v3-content";

export function Squads() {
  return (
    <section className="section" id={v3Content.squads.id}>
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <h1 className="mb-3 fw-semibold text-center lh-base">{v3Content.squads.headline}</h1>
          </div>
        </div>

        <Swiper
          modules={[Autoplay, Pagination]}
          autoplay={{ delay: 3000, disableOnInteraction: false }}
          pagination={{ clickable: true }}
          loop
          spaceBetween={20}
          slidesPerView={1}
          breakpoints={{ 576: { slidesPerView: 2 }, 992: { slidesPerView: 4 } }}
          className="pb-5 mt-3"
        >
          {v3Content.squads.items.map(item => (
            <SwiperSlide key={item.title}>
              <div className="card text-center h-100">
                <div className="card-body p-4">
                  <div className="avatar-md mx-auto mb-3">
                    <div className="avatar-title bg-success-subtle text-success rounded-circle">
                      <i className={`${item.icon} fs-1`} />
                    </div>
                  </div>
                  <h5 className="fs-17 mb-2">{item.title}</h5>
                  <p className="text-muted fs-13 mb-0">{item.description}</p>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
